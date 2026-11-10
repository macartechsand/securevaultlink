-- 2026-11-12: JIT access phase 2 (docs/product/innovation.md 9.1): dual control (k of N approvers) and
-- "rotate after use". Requires 20261110000000_jit_access.sql. Safe to re-run.
--
-- Dual control: besides the owner, the owner may name up to 4 approvers for an eligibility and require
-- 1 to 5 approvals. An approver must hold a standing (non-JIT, non-expired) share of the item, so their
-- own client can open the item key and seal it to the requester. The server only counts approvals: the
-- share is created when the last required approval arrives, with the key sealed by that approver's
-- client. Any approver (or the owner) can deny, which ends the request (one veto is enough).
--
-- Rotate after use: an eligibility can require a password change after each access. Approving records a
-- rotation due at the end of the access window (moved to "now" when ended early). The owner's client
-- shows it as a deadline in the rotation queue until the password changes or the owner dismisses it.
-- Fully unattended rotation is not possible without the server seeing the secret (zero-knowledge): the
-- owner's device does it, one click for items with a connector.

-- ------------------------------------------------------------------ eligibility options
alter table public.jit_eligibility add column if not exists approvals_required integer not null default 1;
alter table public.jit_eligibility add column if not exists rotate_after_use boolean not null default false;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'jit_eligibility_approvals_required_check') then
    alter table public.jit_eligibility add constraint jit_eligibility_approvals_required_check check (approvals_required between 1 and 5);
  end if;
end;
$$;
grant insert (approvals_required, rotate_after_use) on public.jit_eligibility to authenticated;
grant update (approvals_required, rotate_after_use) on public.jit_eligibility to authenticated;

alter table public.jit_requests add column if not exists approvals integer not null default 0;

-- ------------------------------------------------------------------ approvers
create table if not exists public.jit_approvers (
  eligibility_id uuid not null references public.jit_eligibility (id) on delete cascade,
  approver_id uuid not null references auth.users (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  approver_email text,
  created_at timestamptz not null default now(),
  primary key (eligibility_id, approver_id)
);
create index if not exists jit_approvers_approver_idx on public.jit_approvers (approver_id);

-- Holds a standing share of the item (can open its key), excluding JIT and expired shares.
create or replace function private.has_standing_share(p_item uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.item_shares s
    where s.item_id = p_item and s.recipient_id = p_user and s.jit_request_id is null
      and (s.expires_at is null or s.expires_at > now())
  )
$$;
revoke all on function private.has_standing_share(uuid, uuid) from public, anon, authenticated;

create or replace function private.is_jit_approver(p_eligibility uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.jit_approvers a where a.eligibility_id = p_eligibility and a.approver_id = auth.uid())
$$;
revoke all on function private.is_jit_approver(uuid) from public, anon;
grant execute on function private.is_jit_approver(uuid) to authenticated;

create or replace function private.guard_jit_approver() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  e public.jit_eligibility%rowtype;
begin
  select * into e from public.jit_eligibility where id = new.eligibility_id;
  if not found or e.owner_id <> new.owner_id then
    raise exception 'Eligibility not found';
  end if;
  if new.approver_id in (e.owner_id, e.member_id) then
    raise exception 'JIT_APPROVER_INVALID: the owner already approves and the requester cannot approve' using errcode = 'P0001';
  end if;
  if not private.has_standing_share(e.item_id, new.approver_id) then
    raise exception 'JIT_APPROVER_NO_ACCESS: share the item with this person first' using errcode = 'P0001';
  end if;
  if (select count(*) from public.jit_approvers a where a.eligibility_id = new.eligibility_id) >= 4 then
    raise exception 'JIT_APPROVER_LIMIT: up to 4 approvers' using errcode = 'P0001';
  end if;
  new.approver_email := (select email from auth.users where id = new.approver_id);
  perform private.audit(e.owner_id, 'jit.approver_added', 'jit_eligibility', e.id::text,
                        jsonb_build_object('item', e.item_id, 'approver', new.approver_id));
  return new;
end;
$$;
revoke all on function private.guard_jit_approver() from public, anon, authenticated;
drop trigger if exists jit_approvers_guard on public.jit_approvers;
create trigger jit_approvers_guard before insert on public.jit_approvers
  for each row execute function private.guard_jit_approver();

alter table public.jit_approvers enable row level security;
alter table public.jit_approvers force row level security;
revoke all on public.jit_approvers from anon, public, authenticated;
grant select, delete on public.jit_approvers to authenticated;
grant insert (eligibility_id, approver_id) on public.jit_approvers to authenticated;

drop policy if exists jit_approvers_select on public.jit_approvers;
create policy jit_approvers_select on public.jit_approvers for select to authenticated
  using ((owner_id = (select auth.uid()) or approver_id = (select auth.uid())) and private.vault_mfa_satisfied());
drop policy if exists jit_approvers_insert on public.jit_approvers;
create policy jit_approvers_insert on public.jit_approvers for insert to authenticated
  with check (owner_id = (select auth.uid()) and private.vault_mfa_satisfied() and private.is_premium(auth.uid()));
drop policy if exists jit_approvers_delete on public.jit_approvers;
create policy jit_approvers_delete on public.jit_approvers for delete to authenticated
  using (owner_id = (select auth.uid()));

-- Approvers see the eligibility (sealed label is for the member only; approvers read the item itself).
drop policy if exists jit_eligibility_select on public.jit_eligibility;
create policy jit_eligibility_select on public.jit_eligibility for select to authenticated
  using ((owner_id = (select auth.uid()) or member_id = (select auth.uid()) or private.is_jit_approver(id))
         and private.vault_mfa_satisfied());

drop policy if exists jit_requests_select on public.jit_requests;
create policy jit_requests_select on public.jit_requests for select to authenticated
  using ((owner_id = (select auth.uid()) or requester_id = (select auth.uid()) or private.is_jit_approver(eligibility_id))
         and private.vault_mfa_satisfied());

-- ------------------------------------------------------------------ approvals
create table if not exists public.jit_approvals (
  request_id uuid not null references public.jit_requests (id) on delete cascade,
  approver_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (request_id, approver_id)
);
alter table public.jit_approvals enable row level security;
alter table public.jit_approvals force row level security;
revoke all on public.jit_approvals from anon, public, authenticated;
grant select on public.jit_approvals to authenticated;
drop policy if exists jit_approvals_select on public.jit_approvals;
create policy jit_approvals_select on public.jit_approvals for select to authenticated
  using (exists (select 1 from public.jit_requests r where r.id = request_id
                 and (r.owner_id = (select auth.uid()) or r.requester_id = (select auth.uid()) or private.is_jit_approver(r.eligibility_id)))
         and private.vault_mfa_satisfied());

-- ------------------------------------------------------------------ rotation due after use
create table if not exists public.jit_rotation_due (
  request_id uuid primary key references public.jit_requests (id) on delete cascade,
  item_id uuid not null references public.vault_entries (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  due_from timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists jit_rotation_due_owner_idx on public.jit_rotation_due (owner_id);
alter table public.jit_rotation_due enable row level security;
alter table public.jit_rotation_due force row level security;
revoke all on public.jit_rotation_due from anon, public, authenticated;
grant select, delete on public.jit_rotation_due to authenticated;
drop policy if exists jit_rotation_due_select on public.jit_rotation_due;
create policy jit_rotation_due_select on public.jit_rotation_due for select to authenticated
  using (owner_id = (select auth.uid()) and private.vault_mfa_satisfied());
drop policy if exists jit_rotation_due_delete on public.jit_rotation_due;
create policy jit_rotation_due_delete on public.jit_rotation_due for delete to authenticated
  using (owner_id = (select auth.uid()));

-- ------------------------------------------------------------------ RPCs (replace phase 1)
-- Owner or a named approver gets the requester's public key.
create or replace function public.jit_requester_key(p_request uuid) returns text
language sql stable security definer set search_path = '' as $$
  select k.public_key
  from public.jit_requests r
  join public.user_keys k on k.user_id = r.requester_id
  where r.id = p_request and (r.owner_id = auth.uid() or private.is_jit_approver(r.eligibility_id))
    and private.vault_mfa_satisfied()
$$;

-- Returns the access deadline when this approval completes the quorum, null while more are needed.
create or replace function public.jit_approve(p_request uuid, p_sealed_key text) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  r public.jit_requests%rowtype;
  e public.jit_eligibility%rowtype;
  v_count integer;
  v_expires timestamptz;
begin
  if auth.uid() is null or not private.vault_mfa_satisfied() then
    raise exception 'Not allowed';
  end if;
  select * into r from public.jit_requests where id = p_request for update;
  if not found then
    raise exception 'Request not found';
  end if;
  select * into e from public.jit_eligibility where id = r.eligibility_id;
  if not found then
    raise exception 'The person is no longer eligible';
  end if;
  if auth.uid() <> r.owner_id and not private.is_jit_approver(e.id) then
    raise exception 'Request not found';
  end if;
  if auth.uid() = r.requester_id then
    raise exception 'JIT_SELF_APPROVAL: you cannot approve your own request' using errcode = 'P0001';
  end if;
  if r.status <> 'pending' then
    raise exception 'JIT_NOT_PENDING: this request was already decided' using errcode = 'P0001';
  end if;
  if not private.is_premium(r.owner_id) then
    raise exception 'PREMIUM_REQUIRED: jit' using errcode = 'P0001';
  end if;
  -- An approver who lost their own access can no longer vouch for (or seal) the item.
  if auth.uid() <> r.owner_id and not private.has_standing_share(r.item_id, auth.uid()) then
    raise exception 'JIT_APPROVER_NO_ACCESS: you no longer have access to this item' using errcode = 'P0001';
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
  if exists (select 1 from public.jit_approvals a where a.request_id = r.id and a.approver_id = auth.uid()) then
    raise exception 'JIT_ALREADY_APPROVED: you already approved this request' using errcode = 'P0001';
  end if;

  insert into public.jit_approvals (request_id, approver_id) values (r.id, auth.uid());
  select count(*) into v_count from public.jit_approvals a where a.request_id = r.id;
  update public.jit_requests set approvals = v_count where id = r.id;

  if v_count < e.approvals_required then
    perform private.audit(r.owner_id, 'jit.approval_recorded', 'jit_request', r.id::text,
                          jsonb_build_object('item', r.item_id, 'by', auth.uid(), 'approvals', v_count, 'required', e.approvals_required));
    return null;
  end if;

  v_expires := now() + make_interval(mins => r.minutes);
  delete from public.item_shares where item_id = r.item_id and recipient_id = r.requester_id and jit_request_id is not null;
  perform set_config('securevault.jit_approve', 'on', true);
  insert into public.item_shares (item_id, owner_id, recipient_id, permission, sealed_key, expires_at, jit_request_id)
  values (r.item_id, r.owner_id, r.requester_id, 'view', p_sealed_key, v_expires, r.id);
  perform set_config('securevault.jit_approve', 'off', true);
  update public.jit_requests set status = 'approved', decided_at = now(), expires_at = v_expires where id = r.id;
  if e.rotate_after_use then
    insert into public.jit_rotation_due (request_id, item_id, owner_id, due_from)
    values (r.id, r.item_id, r.owner_id, v_expires)
    on conflict (request_id) do update set due_from = excluded.due_from;
  end if;
  perform private.audit(r.owner_id, 'jit.approved', 'jit_request', r.id::text,
                        jsonb_build_object('item', r.item_id, 'requester', r.requester_id, 'until', v_expires, 'by', auth.uid(), 'approvals', v_count));
  perform private.audit(r.requester_id, 'jit.approved', 'jit_request', r.id::text, jsonb_build_object('item', r.item_id, 'until', v_expires));
  return v_expires;
end;
$$;

-- Owner or any approver can deny (one veto ends the request).
create or replace function public.jit_deny(p_request uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.jit_requests%rowtype;
begin
  if auth.uid() is null or not private.vault_mfa_satisfied() then
    raise exception 'Not allowed';
  end if;
  select * into r from public.jit_requests where id = p_request for update;
  if not found or (auth.uid() <> r.owner_id and not private.is_jit_approver(r.eligibility_id)) then
    raise exception 'Request not found';
  end if;
  if r.status <> 'pending' then
    raise exception 'JIT_NOT_PENDING: this request was already decided' using errcode = 'P0001';
  end if;
  update public.jit_requests set status = 'denied', decided_at = now() where id = r.id;
  perform private.audit(r.owner_id, 'jit.denied', 'jit_request', r.id::text, jsonb_build_object('item', r.item_id, 'requester', r.requester_id, 'by', auth.uid()));
  perform private.audit(r.requester_id, 'jit.denied', 'jit_request', r.id::text, jsonb_build_object('item', r.item_id));
end;
$$;

-- Ending early moves the rotation due to now.
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
    update public.jit_rotation_due set due_from = least(due_from, now()) where request_id = r.id;
    perform private.audit(r.owner_id, 'jit.revoked', 'jit_request', r.id::text, jsonb_build_object('item', r.item_id, 'by', auth.uid()));
    perform private.audit(r.requester_id, 'jit.revoked', 'jit_request', r.id::text, jsonb_build_object('item', r.item_id));
  else
    raise exception 'JIT_NOT_PENDING: nothing to end' using errcode = 'P0001';
  end if;
end;
$$;

-- Removing an approver while a request waits: their approval no longer counts toward the quorum.
create or replace function private.jit_approver_removed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.jit_approvals a
  using public.jit_requests r
  where a.request_id = r.id and r.eligibility_id = old.eligibility_id and r.status = 'pending' and a.approver_id = old.approver_id;
  update public.jit_requests r
  set approvals = (select count(*) from public.jit_approvals a where a.request_id = r.id)
  where r.eligibility_id = old.eligibility_id and r.status = 'pending';
  perform private.audit(old.owner_id, 'jit.approver_removed', 'jit_eligibility', old.eligibility_id::text,
                        jsonb_build_object('approver', old.approver_id));
  return old;
end;
$$;
revoke all on function private.jit_approver_removed() from public, anon, authenticated;
drop trigger if exists jit_approvers_removed on public.jit_approvers;
create trigger jit_approvers_removed after delete on public.jit_approvers
  for each row execute function private.jit_approver_removed();

revoke all on function public.jit_requester_key(uuid), public.jit_approve(uuid, text), public.jit_deny(uuid), public.jit_end(uuid) from public, anon;
grant execute on function public.jit_requester_key(uuid), public.jit_approve(uuid, text), public.jit_deny(uuid), public.jit_end(uuid) to authenticated;
