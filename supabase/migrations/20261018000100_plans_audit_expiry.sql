-- Phase A: plans (free/premium) enforced server-side, 48 h limit for free shares/transfers,
-- optional recovery key, and an append-only audit log.
-- Requires 20261018000000_fix_file_vault_policies.sql.

-- ------------------------------------------------------------------ plans
create table if not exists public.user_plans (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'premium')),
  updated_at timestamptz not null default now()
);
alter table public.user_plans enable row level security;
alter table public.user_plans force row level security;
revoke all on public.user_plans from anon, authenticated, public;
grant select on public.user_plans to authenticated;
drop policy if exists user_plans_select_own on public.user_plans;
create policy user_plans_select_own on public.user_plans for select to authenticated
  using ((select auth.uid()) = user_id);
-- No client writes: plans are set by billing/admin through the service role only.

create or replace function private.user_plan(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select plan from public.user_plans where user_id = p_user), 'free')
$$;

create or replace function private.file_quota_bytes(p_user uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select case private.user_plan(p_user) when 'premium' then 10::bigint * 1024 * 1024 * 1024
              else 100::bigint * 1024 * 1024 end
$$;

-- Free: 48 h. Premium: up to 30 days (custom).
create or replace function private.max_share_hours(p_user uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select case private.user_plan(p_user) when 'premium' then 24 * 30 else 48 end
$$;

-- Exposed to the UI so it can show the user's own limits (no other user's data).
create or replace function public.my_plan_limits() returns table (
  plan text, quota_bytes bigint, max_file_bytes bigint, max_share_hours integer, max_transfer_hours integer
)
language sql stable security definer set search_path = '' as $$
  select private.user_plan(auth.uid()), private.file_quota_bytes(auth.uid()), private.max_file_bytes(auth.uid()),
         private.max_share_hours(auth.uid()), private.max_share_hours(auth.uid())
  where auth.uid() is not null
$$;
revoke all on function public.my_plan_limits() from public, anon;
grant execute on function public.my_plan_limits() to authenticated;

-- ------------------------------------------------------------------ expiry: transfers
alter table public.transfers drop constraint if exists transfers_check;
alter table public.transfers drop constraint if exists transfers_expiry_positive;
alter table public.transfers add constraint transfers_expiry_positive check (expires_at > created_at);

create or replace function private.enforce_transfer_expiry() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.expires_at > now() + make_interval(hours => private.max_share_hours(new.owner_id)) + interval '5 minutes' then
    raise exception 'Transfer duration exceeds your plan limit (% hours)', private.max_share_hours(new.owner_id);
  end if;
  return new;
end;
$$;
drop trigger if exists transfers_expiry on public.transfers;
create trigger transfers_expiry before insert on public.transfers
  for each row execute function private.enforce_transfer_expiry();

-- ------------------------------------------------------------------ expiry: user-to-user shares
alter table public.file_shares add column if not exists expires_at timestamptz;
update public.file_shares set expires_at = created_at + interval '48 hours' where expires_at is null;

create or replace function private.enforce_share_expiry() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  max_hours integer := private.max_share_hours(new.owner_id);
begin
  -- Premium may share without expiry (null); free shares must expire within 48 h.
  if new.expires_at is null then
    if private.user_plan(new.owner_id) <> 'premium' then
      raise exception 'Shares on the free plan must expire within % hours', max_hours;
    end if;
  elsif new.expires_at <= now() then
    raise exception 'Share expiry must be in the future';
  elsif new.expires_at > now() + make_interval(hours => max_hours) + interval '5 minutes' then
    raise exception 'Share duration exceeds your plan limit (% hours)', max_hours;
  end if;
  return new;
end;
$$;
drop trigger if exists file_shares_expiry on public.file_shares;
create trigger file_shares_expiry before insert on public.file_shares
  for each row execute function private.enforce_share_expiry();

-- Recipients only see and read active shares; owners see all of theirs.
drop policy if exists file_shares_select on public.file_shares;
create policy file_shares_select on public.file_shares for select to authenticated using (
  (select auth.uid()) = owner_id
  or ((select auth.uid()) = recipient_id and (expires_at is null or expires_at > now()))
);

create or replace function private.is_file_recipient(p_file_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.file_shares s
    where s.file_id = p_file_id and s.recipient_id = auth.uid() and (s.expires_at is null or s.expires_at > now())
  )
$$;

create or replace function private.can_read_object(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.vault_files f
    join public.file_shares s on s.file_id = f.id
    where f.storage_path = p_name and s.recipient_id = auth.uid() and (s.expires_at is null or s.expires_at > now())
  )
$$;

-- ------------------------------------------------------------------ optional recovery key
grant update (wrapped_dek_recovery) on public.vault_profiles to authenticated;

-- ------------------------------------------------------------------ audit log
create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete cascade,
  actor_id uuid,
  event text not null check (length(event) <= 64),
  target_type text check (length(target_type) <= 32),
  target_id text check (length(target_id) <= 64),
  source text not null default 'server' check (source in ('server', 'client')),
  details jsonb not null default '{}'::jsonb check (pg_column_size(details) <= 2048),
  created_at timestamptz not null default now()
);
create index if not exists audit_events_user_idx on public.audit_events (user_id, created_at desc);
alter table public.audit_events enable row level security;
alter table public.audit_events force row level security;
revoke all on public.audit_events from anon, authenticated, public;
grant select on public.audit_events to authenticated;
drop policy if exists audit_events_select_own on public.audit_events;
create policy audit_events_select_own on public.audit_events for select to authenticated
  using ((select auth.uid()) = user_id);
-- Append-only: no insert/update/delete for clients. Writes only through the functions below.

create or replace function private.audit(
  p_user uuid, p_event text, p_target_type text, p_target_id text, p_details jsonb default '{}'::jsonb
) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_events (user_id, actor_id, event, target_type, target_id, details)
  values (p_user, auth.uid(), p_event, p_target_type, p_target_id, coalesce(p_details, '{}'::jsonb))
$$;

-- Trigger functions record ids and non-secret facts only (never ciphertext or keys).
create or replace function private.audit_vault_entries() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform private.audit(new.user_id, 'vault.entry_created', 'entry', new.id::text);
  elsif tg_op = 'UPDATE' then
    perform private.audit(new.user_id, 'vault.entry_updated', 'entry', new.id::text);
  else
    perform private.audit(old.user_id, 'vault.entry_deleted', 'entry', old.id::text);
  end if;
  return null;
end;
$$;
drop trigger if exists vault_entries_audit on public.vault_entries;
create trigger vault_entries_audit after insert or update or delete on public.vault_entries
  for each row execute function private.audit_vault_entries();

create or replace function private.audit_vault_profiles() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform private.audit(new.user_id, 'vault.created', 'vault', new.user_id::text,
      jsonb_build_object('kdf_iterations', new.kdf->'iterations'));
    if new.wrapped_dek_recovery is not null then
      perform private.audit(new.user_id, 'vault.recovery_enabled', 'vault', new.user_id::text);
    end if;
    return null;
  end if;
  if new.wrapped_dek_password is distinct from old.wrapped_dek_password then
    perform private.audit(new.user_id, 'vault.master_password_changed', 'vault', new.user_id::text);
  end if;
  if old.wrapped_dek_recovery is null and new.wrapped_dek_recovery is not null then
    perform private.audit(new.user_id, 'vault.recovery_enabled', 'vault', new.user_id::text);
  elsif old.wrapped_dek_recovery is not null and new.wrapped_dek_recovery is null then
    perform private.audit(new.user_id, 'vault.recovery_disabled', 'vault', new.user_id::text);
  elsif new.wrapped_dek_recovery is distinct from old.wrapped_dek_recovery then
    perform private.audit(new.user_id, 'vault.recovery_regenerated', 'vault', new.user_id::text);
  end if;
  return null;
end;
$$;
drop trigger if exists vault_profiles_audit on public.vault_profiles;
create trigger vault_profiles_audit after insert or update on public.vault_profiles
  for each row execute function private.audit_vault_profiles();

create or replace function private.audit_vault_files() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.status = 'ready' and old.status <> 'ready' then
      perform private.audit(new.owner_id, 'file.uploaded', new.kind, new.id::text,
        jsonb_build_object('size_bytes', new.size_bytes));
    elsif new.status = 'rejected' and old.status <> 'rejected' then
      perform private.audit(new.owner_id, 'file.upload_rejected', new.kind, new.id::text);
    end if;
  elsif tg_op = 'DELETE' and old.status = 'ready' then
    perform private.audit(old.owner_id, 'file.deleted', old.kind, old.id::text);
  end if;
  return null;
end;
$$;
drop trigger if exists vault_files_audit on public.vault_files;
create trigger vault_files_audit after update or delete on public.vault_files
  for each row execute function private.audit_vault_files();

create or replace function private.audit_file_shares() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform private.audit(new.owner_id, 'file.shared', 'file', new.file_id::text,
      jsonb_build_object('recipient', new.recipient_email, 'expires_at', new.expires_at));
    perform private.audit(new.recipient_id, 'file.received', 'file', new.file_id::text,
      jsonb_build_object('from', new.owner_email, 'expires_at', new.expires_at));
  else
    perform private.audit(old.owner_id, 'file.share_removed', 'file', old.file_id::text,
      jsonb_build_object('recipient', old.recipient_email));
  end if;
  return null;
end;
$$;
drop trigger if exists file_shares_audit on public.file_shares;
create trigger file_shares_audit after insert or delete on public.file_shares
  for each row execute function private.audit_file_shares();

create or replace function private.audit_transfers() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform private.audit(new.owner_id, 'transfer.created', 'transfer', new.id::text,
      jsonb_build_object('max_downloads', new.max_downloads, 'expires_at', new.expires_at,
                         'password', new.password_salt is not null));
  elsif new.revoked and not old.revoked then
    perform private.audit(new.owner_id, 'transfer.revoked', 'transfer', new.id::text);
  elsif new.download_count > old.download_count then
    perform private.audit(new.owner_id, 'transfer.downloaded', 'transfer', new.id::text,
      jsonb_build_object('download', new.download_count, 'of', new.max_downloads));
  end if;
  return null;
end;
$$;
drop trigger if exists transfers_audit on public.transfers;
create trigger transfers_audit after insert or update on public.transfers
  for each row execute function private.audit_transfers();

create or replace function private.audit_user_keys() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.audit(new.user_id, 'keys.sharing_keypair_created', 'keys', new.user_id::text,
    jsonb_build_object('algorithm', new.algorithm));
  return null;
end;
$$;
drop trigger if exists user_keys_audit on public.user_keys;
create trigger user_keys_audit after insert on public.user_keys
  for each row execute function private.audit_user_keys();

-- Client-reported events (unlock, downloads, MFA changes...). Marked source = 'client': they are
-- informative, not proof, because a modified client could omit or fake them.
create or replace function public.log_client_event(p_event text, p_target_type text default null,
  p_target_id text default null, p_details jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if p_event not in ('vault.unlocked', 'vault.unlock_failed', 'vault.recovered', 'vault.locked',
                     'file.downloaded', 'file.shared_downloaded', 'mfa.enrolled', 'mfa.disabled',
                     'session.others_signed_out', 'client.error') then
    raise exception 'Unknown event';
  end if;
  if pg_column_size(coalesce(p_details, '{}'::jsonb)) > 1024 then
    raise exception 'Details too large';
  end if;
  insert into public.audit_events (user_id, actor_id, event, target_type, target_id, source, details)
  values (auth.uid(), auth.uid(), p_event, left(p_target_type, 32), left(p_target_id, 64), 'client',
          coalesce(p_details, '{}'::jsonb));
end;
$$;
revoke all on function public.log_client_event(text, text, text, jsonb) from public, anon;
grant execute on function public.log_client_event(text, text, text, jsonb) to authenticated;

-- Lock down the internal helpers.
revoke all on function private.audit(uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function private.user_plan(uuid), private.max_share_hours(uuid) from public, anon;
grant execute on function private.user_plan(uuid), private.max_share_hours(uuid) to authenticated;
