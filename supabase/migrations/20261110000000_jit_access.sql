-- 2026-11-10: Just-in-time access with approval, zero-knowledge (docs/product/innovation.md 9.1).
--
-- The owner (Premium) marks a person as eligible for an item. That person sees only a label sealed to
-- their own public key (title and user, never the secret) and can REQUEST access for 15 min to 8 h, with
-- a justification sealed to the owner's public key. The owner approves on their own device: their
-- client seals the item key to the requester and calls jit_approve, which creates an item share that
-- expires at a time computed HERE (now + approved minutes). The server never holds the item key, so it
-- cannot release a secret by itself, even if compromised.
--
-- Everything goes through the RPCs below (no direct writes to jit_requests); every step is audited.
-- Safe to re-run.

-- ------------------------------------------------------------------ JIT shares are item_shares rows
alter table public.item_shares add column if not exists jit_request_id uuid;
create index if not exists item_shares_jit_idx on public.item_shares (jit_request_id) where jit_request_id is not null;

-- Only jit_approve may create JIT shares (a transaction-local flag set inside it).
create or replace function private.guard_jit_share() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.jit_request_id is not null and coalesce(current_setting('securevault.jit_approve', true), '') <> 'on' then
    raise exception 'JIT shares are created only by jit_approve';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_jit_share() from public, anon, authenticated;
-- Insert only: the owner's normal key rotation re-seals every share, JIT ones included (update of
-- sealed_key), and jit_request_id has no update grant.
drop trigger if exists item_shares_guard_jit on public.item_shares;
create trigger item_shares_guard_jit before insert on public.item_shares
  for each row execute function private.guard_jit_share();

-- ------------------------------------------------------------------ eligibility
create table if not exists public.jit_eligibility (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.vault_entries (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  member_id uuid not null references auth.users (id) on delete cascade,
  owner_public_key text not null check (length(owner_public_key) <= 512),
  sealed_label text not null check (length(sealed_label) <= 2048),
  max_minutes integer not null default 60 check (max_minutes between 15 and 480),
  created_at timestamptz not null default now(),
  unique (item_id, member_id),
  check (member_id <> owner_id)
);
create index if not exists jit_eligibility_member_idx on public.jit_eligibility (member_id);
-- E-mails shown to each side (filled by the server from the accounts, never by the client).
alter table public.jit_eligibility add column if not exists owner_email text;
alter table public.jit_eligibility add column if not exists member_email text;

create or replace function private.jit_eligibility_emails() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.owner_email := (select email from auth.users where id = new.owner_id);
  new.member_email := (select email from auth.users where id = new.member_id);
  return new;
end;
$$;
revoke all on function private.jit_eligibility_emails() from public, anon, authenticated;
drop trigger if exists jit_eligibility_emails on public.jit_eligibility;
create trigger jit_eligibility_emails before insert on public.jit_eligibility
  for each row execute function private.jit_eligibility_emails();
alter table public.jit_eligibility enable row level security;
alter table public.jit_eligibility force row level security;
revoke all on public.jit_eligibility from anon, public, authenticated;
grant select, delete on public.jit_eligibility to authenticated;
grant insert (item_id, member_id, owner_public_key, sealed_label, max_minutes) on public.jit_eligibility to authenticated;
grant update (sealed_label, max_minutes) on public.jit_eligibility to authenticated;

drop policy if exists jit_eligibility_select on public.jit_eligibility;
create policy jit_eligibility_select on public.jit_eligibility for select to authenticated
  using ((owner_id = (select auth.uid()) or member_id = (select auth.uid())) and private.vault_mfa_satisfied());

drop policy if exists jit_eligibility_insert on public.jit_eligibility;
create policy jit_eligibility_insert on public.jit_eligibility for insert to authenticated
  with check (owner_id = (select auth.uid()) and private.vault_mfa_satisfied() and private.is_premium(auth.uid())
              and private.owns_entry(item_id));

drop policy if exists jit_eligibility_update on public.jit_eligibility;
create policy jit_eligibility_update on public.jit_eligibility for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()) and private.is_premium(auth.uid()));

drop policy if exists jit_eligibility_delete on public.jit_eligibility;
create policy jit_eligibility_delete on public.jit_eligibility for delete to authenticated
  using (owner_id = (select auth.uid()));

-- ------------------------------------------------------------------ requests
create table if not exists public.jit_requests (
  id uuid primary key default gen_random_uuid(),
  eligibility_id uuid not null references public.jit_eligibility (id) on delete cascade,
  item_id uuid not null references public.vault_entries (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  requester_id uuid not null references auth.users (id) on delete cascade,
  sealed_reason text not null check (length(sealed_reason) <= 4096),
  minutes integer not null check (minutes between 15 and 480),
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied', 'revoked', 'cancelled')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  expires_at timestamptz
);
create index if not exists jit_requests_owner_idx on public.jit_requests (owner_id, status);
create index if not exists jit_requests_requester_idx on public.jit_requests (requester_id, created_at desc);
alter table public.jit_requests enable row level security;
alter table public.jit_requests force row level security;
revoke all on public.jit_requests from anon, public, authenticated;
grant select on public.jit_requests to authenticated;

drop policy if exists jit_requests_select on public.jit_requests;
create policy jit_requests_select on public.jit_requests for select to authenticated
  using ((owner_id = (select auth.uid()) or requester_id = (select auth.uid())) and private.vault_mfa_satisfied());

-- ------------------------------------------------------------------ RPCs
create or replace function public.jit_request(p_eligibility uuid, p_minutes integer, p_sealed_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  e public.jit_eligibility%rowtype;
  v_id uuid;
begin
  if auth.uid() is null or not private.vault_mfa_satisfied() then
    raise exception 'Not allowed';
  end if;
  select * into e from public.jit_eligibility where id = p_eligibility and member_id = auth.uid();
  if not found then
    raise exception 'Not eligible for this item';
  end if;
  if p_minutes is null or p_minutes < 15 or p_minutes > e.max_minutes then
    raise exception 'JIT_DURATION: between 15 and % minutes', e.max_minutes using errcode = 'P0001';
  end if;
  if p_sealed_reason is null or length(p_sealed_reason) < 20 or length(p_sealed_reason) > 4096 then
    raise exception 'A justification is required';
  end if;
  if exists (select 1 from public.jit_requests r where r.eligibility_id = e.id
             and (r.status = 'pending' or (r.status = 'approved' and r.expires_at > now()))) then
    raise exception 'JIT_ALREADY_OPEN: a request for this item is already pending or active' using errcode = 'P0001';
  end if;
  if (select count(*) from public.jit_requests r where r.requester_id = auth.uid() and r.created_at > now() - interval '1 day') >= 20 then
    raise exception 'JIT_RATE_LIMIT: too many requests today' using errcode = 'P0001';
  end if;
  insert into public.jit_requests (eligibility_id, item_id, owner_id, requester_id, sealed_reason, minutes)
  values (e.id, e.item_id, e.owner_id, auth.uid(), p_sealed_reason, p_minutes)
  returning id into v_id;
  perform private.audit(e.owner_id, 'jit.requested', 'jit_request', v_id::text, jsonb_build_object('item', e.item_id, 'requester', auth.uid(), 'minutes', p_minutes));
  perform private.audit(auth.uid(), 'jit.requested', 'jit_request', v_id::text, jsonb_build_object('item', e.item_id, 'minutes', p_minutes));
  return v_id;
end;
$$;

-- The owner needs the requester's public key to seal the item key (public data, owner only).
create or replace function public.jit_requester_key(p_request uuid) returns text
language sql stable security definer set search_path = '' as $$
  select k.public_key
  from public.jit_requests r
  join public.user_keys k on k.user_id = r.requester_id
  where r.id = p_request and r.owner_id = auth.uid() and private.vault_mfa_satisfied()
$$;

create or replace function public.jit_approve(p_request uuid, p_sealed_key text) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  r public.jit_requests%rowtype;
  v_expires timestamptz;
begin
  if auth.uid() is null or not private.vault_mfa_satisfied() then
    raise exception 'Not allowed';
  end if;
  select * into r from public.jit_requests where id = p_request for update;
  if not found or r.owner_id <> auth.uid() then
    raise exception 'Request not found';
  end if;
  if r.status <> 'pending' then
    raise exception 'JIT_NOT_PENDING: this request was already decided' using errcode = 'P0001';
  end if;
  if not private.is_premium(auth.uid()) then
    raise exception 'PREMIUM_REQUIRED: jit' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.jit_eligibility e where e.id = r.eligibility_id) then
    raise exception 'The person is no longer eligible';
  end if;
  if exists (select 1 from public.vault_entries v where v.id = r.item_id and v.deleted_at is not null) then
    raise exception 'The item is in the trash';
  end if;
  if exists (select 1 from public.item_shares s where s.item_id = r.item_id and s.recipient_id = r.requester_id and s.jit_request_id is null) then
    raise exception 'JIT_STANDING_SHARE: this person already has permanent access' using errcode = 'P0001';
  end if;
  if p_sealed_key is null or length(p_sealed_key) < 40 or length(p_sealed_key) > 512 then
    raise exception 'Invalid sealed key';
  end if;
  v_expires := now() + make_interval(mins => r.minutes);
  delete from public.item_shares where item_id = r.item_id and recipient_id = r.requester_id and jit_request_id is not null;
  perform set_config('securevault.jit_approve', 'on', true);
  insert into public.item_shares (item_id, owner_id, recipient_id, permission, sealed_key, expires_at, jit_request_id)
  values (r.item_id, r.owner_id, r.requester_id, 'view', p_sealed_key, v_expires, r.id);
  perform set_config('securevault.jit_approve', 'off', true);
  update public.jit_requests set status = 'approved', decided_at = now(), expires_at = v_expires where id = r.id;
  perform private.audit(r.owner_id, 'jit.approved', 'jit_request', r.id::text, jsonb_build_object('item', r.item_id, 'requester', r.requester_id, 'until', v_expires));
  perform private.audit(r.requester_id, 'jit.approved', 'jit_request', r.id::text, jsonb_build_object('item', r.item_id, 'until', v_expires));
  return v_expires;
end;
$$;

create or replace function public.jit_deny(p_request uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.jit_requests%rowtype;
begin
  select * into r from public.jit_requests where id = p_request for update;
  if not found or r.owner_id <> auth.uid() then
    raise exception 'Request not found';
  end if;
  if r.status <> 'pending' then
    raise exception 'JIT_NOT_PENDING: this request was already decided' using errcode = 'P0001';
  end if;
  update public.jit_requests set status = 'denied', decided_at = now() where id = r.id;
  perform private.audit(r.owner_id, 'jit.denied', 'jit_request', r.id::text, jsonb_build_object('item', r.item_id, 'requester', r.requester_id));
  perform private.audit(r.requester_id, 'jit.denied', 'jit_request', r.id::text, jsonb_build_object('item', r.item_id));
end;
$$;

-- Owner ends an active access early; requester cancels a pending request.
create or replace function public.jit_end(p_request uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.jit_requests%rowtype;
begin
  select * into r from public.jit_requests where id = p_request for update;
  if not found or auth.uid() not in (r.owner_id, r.requester_id) then
    raise exception 'Request not found';
  end if;
  if r.status = 'pending' and auth.uid() = r.requester_id then
    update public.jit_requests set status = 'cancelled', decided_at = now() where id = r.id;
    perform private.audit(r.owner_id, 'jit.cancelled', 'jit_request', r.id::text, jsonb_build_object('item', r.item_id));
  elsif r.status = 'approved' then
    delete from public.item_shares where jit_request_id = r.id;
    update public.jit_requests set status = 'revoked', expires_at = least(coalesce(r.expires_at, now()), now()) where id = r.id;
    perform private.audit(r.owner_id, 'jit.revoked', 'jit_request', r.id::text, jsonb_build_object('item', r.item_id, 'by', auth.uid()));
    perform private.audit(r.requester_id, 'jit.revoked', 'jit_request', r.id::text, jsonb_build_object('item', r.item_id));
  else
    raise exception 'JIT_NOT_PENDING: nothing to end' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.jit_request(uuid, integer, text), public.jit_requester_key(uuid), public.jit_approve(uuid, text),
  public.jit_deny(uuid), public.jit_end(uuid) from public, anon;
grant execute on function public.jit_request(uuid, integer, text), public.jit_requester_key(uuid), public.jit_approve(uuid, text),
  public.jit_deny(uuid), public.jit_end(uuid) to authenticated;

-- Removing someone's eligibility ends any access they still have right away (the requests go with
-- the eligibility; the audit trail keeps the history).
create or replace function private.jit_eligibility_removed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.item_shares s
  where s.jit_request_id in (select r.id from public.jit_requests r where r.eligibility_id = old.id);
  perform private.audit(old.owner_id, 'jit.eligibility_removed', 'jit_eligibility', old.id::text,
                        jsonb_build_object('item', old.item_id, 'member', old.member_id));
  return old;
end;
$$;
revoke all on function private.jit_eligibility_removed() from public, anon, authenticated;
drop trigger if exists jit_eligibility_removed on public.jit_eligibility;
create trigger jit_eligibility_removed before delete on public.jit_eligibility
  for each row execute function private.jit_eligibility_removed();

-- ------------------------------------------------------------------ cleanup of expired JIT shares
-- RLS already hides them at the exact expiry (is_item_recipient checks expires_at); this removes the rows.
create or replace function private.jit_cleanup() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  delete from public.item_shares where jit_request_id is not null and expires_at < now();
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function private.jit_cleanup() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('jit-cleanup', '*/15 * * * *', 'select private.jit_cleanup()');
  end if;
end;
$$;
