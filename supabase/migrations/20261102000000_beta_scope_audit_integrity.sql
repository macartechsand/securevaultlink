-- Beta scope (5 Premium licenses, manual, no payments) and a tamper-evident audit log.
-- Requires 20261101000000_licenses.sql.
--
-- 1. Defaults for the paid-free beta: 5 Premium seats and 6 accounts (5 users + the master admin).
--    Only values still at the previous defaults are changed, so a manual choice is kept.
-- 2. Audit integrity (CyberArk "tamper-proof audit trail" principle, adapted):
--    - append-only for everyone, including the service role (UPDATE/DELETE/TRUNCATE raise);
--    - hash chain: every row stores the SHA-256 of the previous row's hash plus its own content,
--      so any change, insertion in the middle or deletion is detected by admin_audit_verify();
--    - the chain head is copied into every off-site backup manifest (scripts/backup), which also
--      makes a truncated tail detectable;
--    - events survive account deletion (pseudonymous user id; security logs are kept on the
--      legitimate-interest basis of the LGPD, see docs/operations/data-storage-and-backup.md).

-- ------------------------------------------------------------------ 1. beta scope
insert into public.app_settings (key, value) values ('premium_seats', '5') on conflict (key) do nothing;
update public.app_settings set value = '5', updated_at = now() where key = 'premium_seats' and value = '10';
update public.app_settings set value = '6', updated_at = now() where key = 'max_users' and value = '10';

-- ------------------------------------------------------------------ 2. audit integrity
create extension if not exists pgcrypto with schema extensions;

-- Keep events after the account is deleted (the cascade used to erase the trail).
alter table public.audit_events drop constraint if exists audit_events_user_id_fkey;

alter table public.audit_events
  add column if not exists chain_seq bigint,
  add column if not exists prev_hash text,
  add column if not exists row_hash text;

-- Canonical content of a row. Timestamps go in as epoch microseconds so the digest does not depend
-- on the session time zone.
create or replace function private.audit_row_digest(p_prev text, r public.audit_events) returns text
language sql stable set search_path = '' as $$
  select encode(extensions.digest(
    p_prev || '|' || jsonb_build_object(
      'seq', r.chain_seq, 'id', r.id, 'user_id', r.user_id, 'actor_id', r.actor_id, 'event', r.event,
      'target_type', r.target_type, 'target_id', r.target_id, 'source', r.source, 'details', r.details,
      'created_at', (extract(epoch from r.created_at) * 1000000)::bigint
    )::text,
    'sha256'), 'hex')
$$;

-- Backfill the chain for existing rows (before the immutability trigger exists).
do $$
declare
  r public.audit_events;
  prev text := 'genesis';
  n bigint := 0;
begin
  if exists (select 1 from public.audit_events where row_hash is null) then
    for r in select * from public.audit_events order by id loop
      n := n + 1;
      r.chain_seq := n;
      r.prev_hash := prev;
      prev := private.audit_row_digest(prev, r);
      update public.audit_events set chain_seq = n, prev_hash = r.prev_hash, row_hash = prev where id = r.id;
    end loop;
  end if;
end;
$$;

create unique index if not exists audit_events_chain_seq_idx on public.audit_events (chain_seq);

-- Every insert, from any role, is chained under a transaction-level lock (serializes audit writes;
-- volume is small).
create or replace function private.audit_chain() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  last public.audit_events;
begin
  perform pg_advisory_xact_lock(724001);
  select * into last from public.audit_events order by chain_seq desc nulls last limit 1;
  new.chain_seq := coalesce(last.chain_seq, 0) + 1;
  new.prev_hash := coalesce(last.row_hash, 'genesis');
  new.row_hash := private.audit_row_digest(new.prev_hash, new);
  return new;
end;
$$;

-- The only allowed removal is the retention purge below (oldest prefix of the chain).
create or replace function private.audit_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and current_setting('app.audit_purge', true) = 'on' then
    return old;
  end if;
  raise exception 'AUDIT_IMMUTABLE: audit events are append-only';
end;
$$;

drop trigger if exists audit_events_chain on public.audit_events;
create trigger audit_events_chain before insert on public.audit_events
  for each row execute function private.audit_chain();
drop trigger if exists audit_events_no_change on public.audit_events;
create trigger audit_events_no_change before update or delete on public.audit_events
  for each row execute function private.audit_immutable();
drop trigger if exists audit_events_no_truncate on public.audit_events;
create trigger audit_events_no_truncate before truncate on public.audit_events
  for each statement execute function private.audit_immutable();

revoke all on function private.audit_row_digest(text, public.audit_events), private.audit_chain(), private.audit_immutable()
  from public, anon, authenticated;

-- Retention: removes only a contiguous prefix of the chain older than the cutoff, records the purge
-- (count and the hash of the last removed row) as a new chained event. Called by cleanup-files.
create or replace function public.audit_purge_before(p_cutoff timestamptz) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  upto bigint;
  anchor text;
  n integer;
begin
  if p_cutoff > now() - interval '180 days' then
    raise exception 'audit retention must be at least 180 days';
  end if;
  select max(chain_seq) into upto from public.audit_events
   where chain_seq < coalesce((select min(chain_seq) from public.audit_events where created_at >= p_cutoff), 9223372036854775807);
  if upto is null then
    return 0;
  end if;
  select row_hash into anchor from public.audit_events where chain_seq = upto;
  perform set_config('app.audit_purge', 'on', true);
  delete from public.audit_events where chain_seq <= upto;
  get diagnostics n = row_count;
  perform set_config('app.audit_purge', 'off', true);
  insert into public.audit_events (user_id, event, source, details)
  values (null, 'system.audit_purged', 'server', jsonb_build_object('removed', n, 'upto_seq', upto, 'anchor', anchor));
  return n;
end;
$$;
revoke all on function public.audit_purge_before(timestamptz) from public, anon, authenticated;

-- First broken link (null when the chain is intact). After a retention purge the chain starts at
-- the first remaining row, whose prev_hash is the purge anchor.
create or replace function private.audit_chain_break() returns bigint
language plpgsql stable security definer set search_path = '' as $$
declare
  r public.audit_events;
  prev text;
begin
  for r in select * from public.audit_events order by chain_seq loop
    prev := coalesce(prev, r.prev_hash);
    if r.prev_hash is distinct from prev or r.row_hash is distinct from private.audit_row_digest(r.prev_hash, r) then
      return r.chain_seq;
    end if;
    prev := r.row_hash;
  end loop;
  return null;
end;
$$;
revoke all on function private.audit_chain_break() from public, anon, authenticated;

create or replace function public.admin_audit_verify() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  head public.audit_events;
  broken bigint;
begin
  perform private.require_admin();
  broken := private.audit_chain_break();
  select * into head from public.audit_events order by chain_seq desc limit 1;
  return jsonb_build_object(
    'ok', broken is null, 'broken_at', broken,
    'events', (select count(*) from public.audit_events), 'head_seq', head.chain_seq,
    'head_hash', head.row_hash, 'head_at', head.created_at
  );
end;
$$;
revoke all on function public.admin_audit_verify() from public, anon;
grant execute on function public.admin_audit_verify() to authenticated;

-- ------------------------------------------------------------------ compliance: audit + backups
create or replace function public.admin_compliance() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  users int := (select count(*) from auth.users);
begin
  perform private.require_admin();
  return jsonb_build_object(
    'users', users,
    'checks', jsonb_build_array(
      jsonb_build_object('key', 'privileged_without_mfa', 'value', (select count(*) from public.app_admins a
         where (a.expires_at is null or a.expires_at > now())
           and not exists (select 1 from auth.mfa_factors f where f.user_id = a.user_id and f.status = 'verified'))),
      jsonb_build_object('key', 'owners', 'value', (select count(*) from public.app_admins where role = 'owner')),
      jsonb_build_object('key', 'users_without_mfa', 'value', (select count(*) from auth.users u
         where not exists (select 1 from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified'))),
      jsonb_build_object('key', 'mfa_required_not_enrolled', 'value', (select count(*) from auth.users u
         where private.mfa_required(u.id) and not exists (select 1 from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified'))),
      jsonb_build_object('key', 'vaults_without_recovery', 'value', (select count(*) from public.vault_profiles where wrapped_dek_recovery is null)),
      jsonb_build_object('key', 'kdf_below_policy', 'value', (select count(*) from public.vault_profiles where (kdf ->> 'iterations')::int < 600000)),
      jsonb_build_object('key', 'legacy_entries_v1', 'value', (select count(*) from public.vault_entries where version = 1)),
      jsonb_build_object('key', 'shares_without_expiry', 'value',
         (select count(*) from public.item_shares where expires_at is null) + (select count(*) from public.file_shares where expires_at is null)),
      jsonb_build_object('key', 'inactive_90d', 'value', (select count(*) from auth.users where coalesce(last_sign_in_at, created_at) < now() - interval '90 days')),
      jsonb_build_object('key', 'unconfirmed_emails', 'value', (select count(*) from auth.users where email_confirmed_at is null)),
      jsonb_build_object('key', 'suspended', 'value', (select count(*) from auth.users where banned_until > now())),
      jsonb_build_object('key', 'exposed_passwords', 'value', (select coalesce(sum((data ->> 'exposed')::int), 0) from public.posture_snapshots)),
      jsonb_build_object('key', 'rotation_overdue', 'value', (select coalesce(sum((data ->> 'rotation_due')::int), 0) from public.posture_snapshots)),
      jsonb_build_object('key', 'failed_unlocks_24h', 'value', (select count(*) from public.audit_events where event = 'vault.unlock_failed' and created_at > now() - interval '24 hours')),
      jsonb_build_object('key', 'cleanup_last_run_hours', 'value',
         (select extract(epoch from now() - max(created_at)) / 3600 from public.audit_events where event = 'system.cleanup')),
      jsonb_build_object('key', 'posture_reporting_users', 'value', (select count(*) from public.posture_snapshots)),
      jsonb_build_object('key', 'audit_chain_broken', 'value', case when private.audit_chain_break() is null then 0 else 1 end),
      jsonb_build_object('key', 'offsite_backup_last_days', 'value',
         (select extract(epoch from now() - max(created_at)) / 86400 from public.audit_events where event = 'system.backup'))
    )
  );
end;
$$;
