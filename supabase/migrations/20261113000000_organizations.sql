-- 2026-11-13: Organizations and the company risk panel (docs/product/innovation.md 9.7). Safe to re-run.
--
-- An organization groups accounts (an MSP and its clients, a company and its staff). Its admins see a
-- RISK PANEL built only from the numeric posture summary each member's own device already reports
-- (posture_snapshots: score, counts of weak/reused/exposed passwords, rotation due, MFA, recovery). Never
-- vault contents, item names or URLs: the server does not have them.
--
-- Invitations are kept by e-mail (org_invites), whether or not an account exists, so an admin cannot use
-- them to find out which addresses have accounts. The invited person sees invitations addressed to their
-- verified e-mail.
--
-- Consent: an invited person is only counted after ACCEPTING, with the text shown in the app; they can
-- leave at any time, and "Compartilhar métricas de segurança" off (user_preferences) removes their
-- snapshot. Every view of the panel is audited on the member's own trail too (transparency).
--
-- All writes go through the RPCs below. Creating an organization requires Premium.

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 80),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.org_members (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  email text,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  invited_by uuid references auth.users (id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index if not exists org_members_user_idx on public.org_members (user_id);

create table if not exists public.org_invites (
  org_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and length(email) between 3 and 254),
  role text not null default 'member' check (role in ('admin', 'member')),
  invited_by uuid references auth.users (id) on delete set null,
  invited_at timestamptz not null default now(),
  primary key (org_id, email)
);
create index if not exists org_invites_email_idx on public.org_invites (email);

create or replace function private.org_role(p_org uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role from public.org_members m where m.org_id = p_org and m.user_id = auth.uid()
$$;
revoke all on function private.org_role(uuid) from public, anon;
grant execute on function private.org_role(uuid) to authenticated;

create or replace function private.is_org_member(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.org_members m where m.org_id = p_org and m.user_id = auth.uid())
$$;
revoke all on function private.is_org_member(uuid) from public, anon;
grant execute on function private.is_org_member(uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.organizations force row level security;
revoke all on public.organizations from anon, public, authenticated;
grant select on public.organizations to authenticated;
drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations for select to authenticated
  using (private.is_org_member(id));

alter table public.org_members enable row level security;
alter table public.org_members force row level security;
revoke all on public.org_members from anon, public, authenticated;
grant select on public.org_members to authenticated;
-- Own rows (including invitations); admins see the whole roster.
drop policy if exists org_members_select on public.org_members;
create policy org_members_select on public.org_members for select to authenticated
  using (user_id = (select auth.uid()) or private.org_role(org_id) in ('owner', 'admin'));

-- The signed-in account's verified e-mail (never taken from the client).
create or replace function private.my_email() returns text
language sql stable security definer set search_path = '' as $$
  select lower(u.email) from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null
$$;
revoke all on function private.my_email() from public, anon;
grant execute on function private.my_email() to authenticated;

alter table public.org_invites enable row level security;
alter table public.org_invites force row level security;
revoke all on public.org_invites from anon, public, authenticated;
grant select on public.org_invites to authenticated;
drop policy if exists org_invites_select on public.org_invites;
create policy org_invites_select on public.org_invites for select to authenticated
  using (email = private.my_email() or private.org_role(org_id) in ('owner', 'admin'));

-- Invitee: the organization name of an invitation addressed to them (they are not a member yet).
create or replace function public.org_my_invites()
returns table (org_id uuid, org_name text, role text, invited_at timestamptz, invited_by_email text)
language sql stable security definer set search_path = '' as $$
  select i.org_id, o.name, i.role, i.invited_at, (select u.email::text from auth.users u where u.id = i.invited_by)
  from public.org_invites i join public.organizations o on o.id = i.org_id
  where i.email = private.my_email()
$$;

-- ------------------------------------------------------------------ RPCs
create or replace function public.org_create(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or not private.vault_mfa_satisfied() then
    raise exception 'Not allowed';
  end if;
  if not private.is_premium(auth.uid()) then
    raise exception 'PREMIUM_REQUIRED: organizations' using errcode = 'P0001';
  end if;
  if (select count(*) from public.organizations o where o.created_by = auth.uid()) >= 5 then
    raise exception 'ORG_LIMIT: up to 5 organizations per account' using errcode = 'P0001';
  end if;
  insert into public.organizations (name, created_by) values (btrim(p_name), auth.uid()) returning id into v_id;
  insert into public.org_members (org_id, user_id, email, role, invited_by)
  values (v_id, auth.uid(), (select email from auth.users where id = auth.uid()), 'owner', auth.uid());
  perform private.audit(auth.uid(), 'org.created', 'organization', v_id::text, jsonb_build_object('name', btrim(p_name)));
  return v_id;
end;
$$;

-- Invites an e-mail address (stored whether or not an account exists: no account probing).
create or replace function public.org_invite(p_org uuid, p_email text, p_role text default 'member') returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(p_email));
begin
  if auth.uid() is null or not private.vault_mfa_satisfied() or coalesce(private.org_role(p_org), '') not in ('owner', 'admin') then
    raise exception 'Not allowed';
  end if;
  if p_role not in ('admin', 'member') or (p_role = 'admin' and coalesce(private.org_role(p_org), '') <> 'owner') then
    raise exception 'ORG_ROLE: only the owner can invite admins' using errcode = 'P0001';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'Invalid e-mail';
  end if;
  if (select count(*) from public.org_members m where m.org_id = p_org) + (select count(*) from public.org_invites i where i.org_id = p_org) >= 50 then
    raise exception 'ORG_FULL: up to 50 members and invitations' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.org_members m where m.org_id = p_org and lower(m.email) = v_email) then
    return;
  end if;
  insert into public.org_invites (org_id, email, role, invited_by) values (p_org, v_email, p_role, auth.uid())
  on conflict (org_id, email) do update set role = excluded.role;
  perform private.audit(auth.uid(), 'org.member_invited', 'organization', p_org::text, jsonb_build_object('role', p_role));
end;
$$;

create or replace function public.org_cancel_invite(p_org uuid, p_email text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or coalesce(private.org_role(p_org), '') not in ('owner', 'admin') then
    raise exception 'Not allowed';
  end if;
  delete from public.org_invites where org_id = p_org and email = lower(btrim(p_email));
end;
$$;

-- The invited person accepts (consent to share the numeric posture summary with the org admins).
create or replace function public.org_accept(p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  i public.org_invites%rowtype;
begin
  select * into i from public.org_invites where org_id = p_org and email = private.my_email();
  if not found then
    raise exception 'Invitation not found';
  end if;
  insert into public.org_members (org_id, user_id, email, role, invited_by)
  values (p_org, auth.uid(), i.email, i.role, i.invited_by)
  on conflict (org_id, user_id) do nothing;
  delete from public.org_invites where org_id = p_org and email = i.email;
  perform private.audit(auth.uid(), 'org.member_joined', 'organization', p_org::text, jsonb_build_object('role', i.role));
end;
$$;

create or replace function public.org_decline(p_org uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.org_invites where org_id = p_org and email = private.my_email()
$$;

-- Declining an invitation or leaving. The last owner cannot leave (delete the organization instead).
create or replace function public.org_leave(p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.org_members m where m.org_id = p_org and m.user_id = auth.uid() and m.role = 'owner')
     and (select count(*) from public.org_members m where m.org_id = p_org and m.role = 'owner') = 1 then
    raise exception 'ORG_LAST_OWNER: delete the organization or name another owner first' using errcode = 'P0001';
  end if;
  delete from public.org_members where org_id = p_org and user_id = auth.uid();
  perform private.audit(auth.uid(), 'org.member_left', 'organization', p_org::text, '{}'::jsonb);
end;
$$;

create or replace function public.org_remove_member(p_org uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_role text;
begin
  if auth.uid() is null or not private.vault_mfa_satisfied() or coalesce(private.org_role(p_org), '') not in ('owner', 'admin') then
    raise exception 'Not allowed';
  end if;
  select role into v_role from public.org_members where org_id = p_org and user_id = p_user;
  if v_role is null then
    raise exception 'Member not found';
  end if;
  if v_role = 'owner' or (v_role = 'admin' and coalesce(private.org_role(p_org), '') <> 'owner') or p_user = auth.uid() then
    raise exception 'ORG_ROLE: not allowed for this member' using errcode = 'P0001';
  end if;
  delete from public.org_members where org_id = p_org and user_id = p_user;
  perform private.audit(p_user, 'org.member_removed', 'organization', p_org::text, jsonb_build_object('by', auth.uid()));
end;
$$;

create or replace function public.org_delete(p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.vault_mfa_satisfied() or coalesce(private.org_role(p_org), '') <> 'owner' then
    raise exception 'Not allowed';
  end if;
  perform private.audit(auth.uid(), 'org.deleted', 'organization', p_org::text, '{}'::jsonb);
  delete from public.organizations where id = p_org;
end;
$$;

-- Risk panel: one row per ACTIVE member, numbers only. Members who turned metrics sharing off (or whose
-- device never reported) appear with null metrics. Each view is audited for the members (transparency).
create or replace function public.org_risk(p_org uuid)
returns table (
  user_id uuid, email text, role text, joined_at timestamptz, last_sign_in_at timestamptz, mfa boolean,
  has_vault boolean, reported_at timestamptz, score integer, items integer, weak integer, reused integer,
  exposed integer, stale integer, rotation_due integer, unsafe_sites integer, recovery boolean, shared_by_me integer
)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.vault_mfa_satisfied() or coalesce(private.org_role(p_org), '') not in ('owner', 'admin') then
    raise exception 'Not allowed';
  end if;
  -- One audit row per view on the viewer's trail; members see "panel viewed" in their own trail.
  perform private.audit(auth.uid(), 'org.risk_viewed', 'organization', p_org::text, '{}'::jsonb);
  insert into public.audit_events (user_id, actor_id, event, target_type, target_id, details)
  select m.user_id, auth.uid(), 'org.risk_viewed', 'organization', p_org::text, '{}'::jsonb
  from public.org_members m
  where m.org_id = p_org and m.user_id <> auth.uid()
    and not exists (select 1 from public.audit_events a where a.user_id = m.user_id and a.event = 'org.risk_viewed'
                    and a.target_id = p_org::text and a.created_at > now() - interval '1 day');
  return query
    select m.user_id, m.email, m.role, m.joined_at, u.last_sign_in_at,
      exists (select 1 from auth.mfa_factors f where f.user_id = m.user_id and f.status = 'verified'),
      exists (select 1 from public.vault_profiles p where p.user_id = m.user_id),
      ps.reported_at,
      (ps.data ->> 'score')::int, (ps.data ->> 'items')::int, (ps.data ->> 'weak')::int, (ps.data ->> 'reused')::int,
      (ps.data ->> 'exposed')::int, (ps.data ->> 'stale')::int, (ps.data ->> 'rotation_due')::int,
      (ps.data ->> 'unsafe_sites')::int,
      exists (select 1 from public.vault_profiles p where p.user_id = m.user_id and p.wrapped_dek_recovery is not null),
      (ps.data ->> 'shared_by_me')::int
    from public.org_members m
    join auth.users u on u.id = m.user_id
    left join public.posture_snapshots ps on ps.user_id = m.user_id
    where m.org_id = p_org
    order by (ps.data ->> 'score')::int asc nulls first, m.email;
end;
$$;

revoke all on function public.org_create(text), public.org_invite(uuid, text, text), public.org_cancel_invite(uuid, text),
  public.org_my_invites(), public.org_accept(uuid), public.org_decline(uuid), public.org_leave(uuid),
  public.org_remove_member(uuid, uuid), public.org_delete(uuid), public.org_risk(uuid) from public, anon;
grant execute on function public.org_create(text), public.org_invite(uuid, text, text), public.org_cancel_invite(uuid, text),
  public.org_my_invites(), public.org_accept(uuid), public.org_decline(uuid), public.org_leave(uuid),
  public.org_remove_member(uuid, uuid), public.org_delete(uuid), public.org_risk(uuid) to authenticated;
