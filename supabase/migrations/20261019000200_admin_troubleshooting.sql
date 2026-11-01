-- Phase E: administrator panel (metadata only, never vault contents) and troubleshooting support.
-- Requires 20261019000100_posture_sessions.sql.
--
-- Grant an administrator (run in the SQL Editor; the user must have MFA enrolled to use the panel):
--   insert into public.app_admins (user_id, role) select id, 'admin' from auth.users where email = 'admin@example.com';

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'admin' check (role in ('admin', 'support')),
  created_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
alter table public.app_admins force row level security;
revoke all on public.app_admins from anon, authenticated, public;
grant select on public.app_admins to authenticated;
drop policy if exists app_admins_select_own on public.app_admins;
create policy app_admins_select_own on public.app_admins for select to authenticated
  using ((select auth.uid()) = user_id);
-- No client writes: admins are granted through the SQL Editor / service role only.

create or replace function private.admin_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.app_admins where user_id = auth.uid()
$$;

-- Admin functions require an admin role AND an MFA-verified (aal2) session.
create or replace function private.require_admin(p_min text default 'support') returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  r text := private.admin_role();
begin
  if r is null then
    raise exception 'Admin access required';
  end if;
  if coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
    raise exception 'Admins must sign in with two-factor authentication';
  end if;
  if p_min = 'admin' and r <> 'admin' then
    raise exception 'This action requires the admin role';
  end if;
  return r;
end;
$$;

-- What the UI needs to decide whether to show the admin area.
create or replace function public.my_admin_status() returns table (role text, mfa_ok boolean)
language sql stable security definer set search_path = '' as $$
  select private.admin_role(), coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
  where private.admin_role() is not null
$$;

create or replace function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return jsonb_build_object(
    'users', (select count(*) from auth.users),
    'users_confirmed', (select count(*) from auth.users where email_confirmed_at is not null),
    'new_users_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'active_7d', (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
    'vaults', (select count(*) from public.vault_profiles),
    'recovery_enabled', (select count(*) from public.vault_profiles where wrapped_dek_recovery is not null),
    'mfa_users', (select count(distinct user_id) from auth.mfa_factors where status = 'verified'),
    'premium_users', (select count(*) from public.user_plans where plan = 'premium'),
    'items', (select count(*) from public.vault_entries),
    'files', (select count(*) from public.vault_files where status = 'ready'),
    'storage_bytes', (select coalesce(sum(size_bytes), 0) from public.vault_files where status = 'ready'),
    'pending_uploads', (select count(*) from public.vault_files where status = 'pending' and created_at < now() - interval '1 hour'),
    'rejected_uploads', (select count(*) from public.vault_files where status = 'rejected'),
    'active_transfers', (select count(*) from public.transfers where not revoked and expires_at > now() and download_count < max_downloads),
    'expired_transfer_files', (select count(*) from public.vault_files where kind = 'transfer' and expires_at <= now()),
    'item_shares', (select count(*) from public.item_shares),
    'file_shares', (select count(*) from public.file_shares),
    'events_24h', (select count(*) from public.audit_events where created_at > now() - interval '24 hours'),
    'failed_unlocks_24h', (select count(*) from public.audit_events where event = 'vault.unlock_failed' and created_at > now() - interval '24 hours'),
    'client_errors_24h', (select count(*) from public.audit_events where event = 'client.error' and created_at > now() - interval '24 hours'),
    'last_cleanup', (select max(created_at) from public.audit_events where event = 'system.cleanup')
  );
end;
$$;

create or replace function public.admin_list_users(p_search text default '', p_limit integer default 50, p_offset integer default 0)
returns table (
  user_id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz, confirmed boolean, banned_until timestamptz,
  plan text, mfa_factors integer, has_vault boolean, recovery boolean, items integer, files integer, storage_bytes bigint,
  failed_unlocks_7d integer, client_errors_7d integer
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
    select u.id, u.email::text, u.created_at, u.last_sign_in_at, u.email_confirmed_at is not null, u.banned_until,
      coalesce(pl.plan, 'free'),
      (select count(*)::int from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified'),
      exists (select 1 from public.vault_profiles p where p.user_id = u.id),
      exists (select 1 from public.vault_profiles p where p.user_id = u.id and p.wrapped_dek_recovery is not null),
      (select count(*)::int from public.vault_entries e where e.user_id = u.id),
      (select count(*)::int from public.vault_files vf where vf.owner_id = u.id and vf.status = 'ready'),
      (select coalesce(sum(vf.size_bytes), 0)::bigint from public.vault_files vf where vf.owner_id = u.id and vf.status = 'ready'),
      (select count(*)::int from public.audit_events a where a.user_id = u.id and a.event = 'vault.unlock_failed' and a.created_at > now() - interval '7 days'),
      (select count(*)::int from public.audit_events a where a.user_id = u.id and a.event = 'client.error' and a.created_at > now() - interval '7 days')
    from auth.users u
    left join public.user_plans pl on pl.user_id = u.id
    where p_search = '' or u.email ilike '%' || p_search || '%'
    order by u.created_at desc
    limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end;
$$;

create or replace function public.admin_user_events(p_user uuid, p_limit integer default 100)
returns table (id bigint, event text, target_type text, target_id text, source text, details jsonb, actor_id uuid, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
    select a.id, a.event, a.target_type, a.target_id, a.source, a.details, a.actor_id, a.created_at
    from public.audit_events a
    where a.user_id = p_user
    order by a.created_at desc
    limit least(greatest(p_limit, 1), 500);
end;
$$;

create or replace function public.admin_set_plan(p_user uuid, p_plan text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin('admin');
  if p_plan not in ('free', 'premium') then
    raise exception 'Invalid plan';
  end if;
  insert into public.user_plans (user_id, plan, updated_at) values (p_user, p_plan, now())
  on conflict (user_id) do update set plan = excluded.plan, updated_at = now();
  perform private.audit(p_user, 'admin.plan_changed', 'user', p_user::text, jsonb_build_object('plan', p_plan));
end;
$$;

-- Ends every session of a user (e.g. a compromised account). Their access tokens expire within ~1 h.
create or replace function public.admin_revoke_sessions(p_user uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  perform private.require_admin();
  delete from auth.sessions where user_id = p_user;
  get diagnostics n = row_count;
  perform private.audit(p_user, 'admin.sessions_revoked', 'user', p_user::text, jsonb_build_object('sessions', n));
  return n;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.my_admin_status()', 'public.admin_overview()', 'public.admin_list_users(text, integer, integer)',
    'public.admin_user_events(uuid, integer)', 'public.admin_set_plan(uuid, text)', 'public.admin_revoke_sessions(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke all on function private.admin_role(), private.require_admin(text) from public, anon, authenticated;

-- Client error reports: keep the message short and free of user data (enforced again client-side).
-- (log_client_event already allow-lists 'client.error'; nothing else to change.)
