-- IAM / PAM for administrators and metadata-only support insights.
-- Admins never get vault contents: only server metadata and numeric posture summaries that the
-- user's own app reports (and the user can turn off).
-- Requires 20261020000000_closed_beta.sql.

-- ================================================================== PAM: privileged roles
alter table public.app_admins drop constraint if exists app_admins_role_check;
alter table public.app_admins add constraint app_admins_role_check check (role in ('owner', 'admin', 'support', 'auditor'));
alter table public.app_admins add column if not exists expires_at timestamptz;
alter table public.app_admins add column if not exists reason text check (length(reason) <= 300);
alter table public.app_admins add column if not exists granted_by uuid references auth.users (id) on delete set null;

-- The single existing admin (the master administrator) becomes the owner.
update public.app_admins set role = 'owner'
where role = 'admin' and (select count(*) from public.app_admins) = 1;

-- Active role only (time-bound grants expire by themselves).
create or replace function private.admin_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.app_admins
  where user_id = auth.uid() and (expires_at is null or expires_at > now())
$$;

-- p_min: 'support' (read: support, auditor, admin, owner) | 'admin' (admin, owner) | 'owner'.
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
  if p_min = 'admin' and r not in ('admin', 'owner') then
    raise exception 'This action requires the admin role';
  end if;
  if p_min = 'owner' and r <> 'owner' then
    raise exception 'This action requires the owner role';
  end if;
  return r;
end;
$$;

drop function if exists public.my_admin_status();
create or replace function public.my_admin_status() returns table (role text, mfa_ok boolean, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select a.role, coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2', a.expires_at
  from public.app_admins a
  where a.user_id = auth.uid() and (a.expires_at is null or a.expires_at > now())
$$;

-- Privileged access review (any privileged role can read it).
create or replace function public.admin_list_roles() returns table (
  user_id uuid, email text, role text, expires_at timestamptz, reason text, granted_by_email text, created_at timestamptz,
  mfa boolean, last_sign_in_at timestamptz, active boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
    select a.user_id, u.email::text, a.role, a.expires_at, a.reason, g.email::text, a.created_at,
      exists (select 1 from auth.mfa_factors f where f.user_id = a.user_id and f.status = 'verified'),
      u.last_sign_in_at, (a.expires_at is null or a.expires_at > now())
    from public.app_admins a
    join auth.users u on u.id = a.user_id
    left join auth.users g on g.id = a.granted_by
    order by (a.role = 'owner') desc, a.created_at;
end;
$$;

-- Owner grants a privileged role, optionally just-in-time (hours), always with a reason.
create or replace function public.owner_grant_role(p_user uuid, p_role text, p_hours integer, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin('owner');
  if p_role not in ('admin', 'support', 'auditor') then
    raise exception 'Role must be admin, support or auditor';
  end if;
  if coalesce(length(trim(p_reason)), 0) < 5 then
    raise exception 'A reason is required';
  end if;
  if p_hours is not null and (p_hours < 1 or p_hours > 24 * 90) then
    raise exception 'Duration must be between 1 hour and 90 days';
  end if;
  if exists (select 1 from public.app_admins where user_id = p_user and role = 'owner') then
    raise exception 'The owner role cannot be changed here';
  end if;
  insert into public.app_admins (user_id, role, expires_at, reason, granted_by)
  values (p_user, p_role, case when p_hours is null then null else now() + make_interval(hours => p_hours) end, left(p_reason, 300), auth.uid())
  on conflict (user_id) do update
    set role = excluded.role, expires_at = excluded.expires_at, reason = excluded.reason, granted_by = excluded.granted_by, created_at = now();
  perform private.audit(p_user, 'admin.role_granted', 'user', p_user::text,
    jsonb_build_object('role', p_role, 'hours', p_hours, 'reason', left(p_reason, 300)));
end;
$$;

create or replace function public.owner_revoke_role(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin('owner');
  if exists (select 1 from public.app_admins where user_id = p_user and role = 'owner') then
    raise exception 'The owner role cannot be revoked here';
  end if;
  delete from public.app_admins where user_id = p_user;
  perform private.audit(p_user, 'admin.role_revoked', 'user', p_user::text);
end;
$$;

-- ================================================================== IAM: MFA policy
create table if not exists public.user_policies (
  user_id uuid primary key references auth.users (id) on delete cascade,
  require_mfa boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.user_policies enable row level security;
alter table public.user_policies force row level security;
revoke all on public.user_policies from anon, authenticated, public;
grant select on public.user_policies to authenticated;
drop policy if exists user_policies_select_own on public.user_policies;
create policy user_policies_select_own on public.user_policies for select to authenticated using ((select auth.uid()) = user_id);

insert into public.app_settings (key, value) values ('require_mfa_all', 'false') on conflict (key) do nothing;

create or replace function private.mfa_required(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.setting('require_mfa_all', 'false') = 'true'
      or coalesce((select require_mfa from public.user_policies where user_id = p_user), false)
      or exists (select 1 from public.app_admins a where a.user_id = p_user and (a.expires_at is null or a.expires_at > now()))
$$;

-- Vault access: aal2 when the user has MFA; when MFA is REQUIRED, a verified factor + aal2 are mandatory.
create or replace function private.vault_mfa_satisfied() returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when private.mfa_required(auth.uid()) then
      coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      and exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified')
    else
      coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified')
  end
$$;

create or replace function public.my_security_policy() returns table (mfa_required boolean)
language sql stable security definer set search_path = '' as $$
  select private.mfa_required(auth.uid()) where auth.uid() is not null
$$;

create or replace function public.admin_set_user_policy(p_user uuid, p_require_mfa boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin('admin');
  insert into public.user_policies (user_id, require_mfa, updated_at) values (p_user, p_require_mfa, now())
  on conflict (user_id) do update set require_mfa = excluded.require_mfa, updated_at = now();
  perform private.audit(p_user, 'admin.policy_changed', 'user', p_user::text, jsonb_build_object('require_mfa', p_require_mfa));
end;
$$;

-- Accept the new global setting key.
create or replace function public.admin_set_setting(p_key text, p_value text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin('admin');
  if p_key = 'signup_mode' and p_value not in ('allowlist', 'open') then
    raise exception 'signup_mode must be allowlist or open';
  elsif p_key = 'require_mfa_all' and p_value not in ('true', 'false') then
    raise exception 'require_mfa_all must be true or false';
  elsif p_key in ('max_users', 'free_quota_mb', 'premium_quota_mb') and (p_value !~ '^\d{1,6}$' or p_value::int < 1) then
    raise exception '% must be a positive integer', p_key;
  elsif p_key not in ('signup_mode', 'max_users', 'free_quota_mb', 'premium_quota_mb', 'require_mfa_all') then
    raise exception 'Unknown setting';
  end if;
  insert into public.app_settings (key, value, updated_at) values (p_key, p_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  perform private.audit(auth.uid(), 'admin.setting_changed', 'setting', p_key, jsonb_build_object('value', p_value));
end;
$$;

-- ================================================================== support metadata
create table if not exists public.user_preferences (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  share_security_metrics boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.user_preferences enable row level security;
alter table public.user_preferences force row level security;
revoke all on public.user_preferences from anon, authenticated, public;
grant select, insert on public.user_preferences to authenticated;
grant update (share_security_metrics, updated_at) on public.user_preferences to authenticated;
drop policy if exists user_preferences_own on public.user_preferences;
create policy user_preferences_own on public.user_preferences for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Numeric posture summary reported by the user's app (never contents, names or URLs).
create table if not exists public.posture_snapshots (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null check (pg_column_size(data) <= 2048),
  reported_at timestamptz not null default now()
);
alter table public.posture_snapshots enable row level security;
alter table public.posture_snapshots force row level security;
revoke all on public.posture_snapshots from anon, authenticated, public;
grant select on public.posture_snapshots to authenticated;
drop policy if exists posture_snapshots_own on public.posture_snapshots;
create policy posture_snapshots_own on public.posture_snapshots for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.report_posture(p_data jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  allowed text[] := array['score', 'items', 'logins', 'notes', 'secrets', 'cards', 'weak', 'reused', 'exposed', 'stale',
    'rotation_due', 'rotation_scheduled', 'unsafe_sites', 'attachments', 'folders', 'shared_by_me', 'shared_with_me',
    'security_check_ran', 'undecryptable', 'mfa', 'recovery'];
  k text;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if coalesce((select share_security_metrics from public.user_preferences where user_id = auth.uid()), true) = false then
    delete from public.posture_snapshots where user_id = auth.uid();
    return;
  end if;
  for k in select jsonb_object_keys(p_data) loop
    if not (k = any (allowed)) or jsonb_typeof(p_data -> k) not in ('number', 'boolean') then
      raise exception 'Invalid posture field';
    end if;
  end loop;
  insert into public.posture_snapshots (user_id, data, reported_at) values (auth.uid(), p_data, now())
  on conflict (user_id) do update set data = excluded.data, reported_at = now();
end;
$$;

create table if not exists public.support_reports (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  report text not null check (length(report) <= 4000),
  created_at timestamptz not null default now()
);
create index if not exists support_reports_user_idx on public.support_reports (user_id, created_at desc);
alter table public.support_reports enable row level security;
alter table public.support_reports force row level security;
revoke all on public.support_reports from anon, authenticated, public;
grant select on public.support_reports to authenticated;
drop policy if exists support_reports_own on public.support_reports;
create policy support_reports_own on public.support_reports for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.submit_support_report(p_report text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if (select count(*) from public.support_reports where user_id = auth.uid() and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Too many reports. Try again later.';
  end if;
  insert into public.support_reports (user_id, report) values (auth.uid(), left(p_report, 4000));
  perform private.audit(auth.uid(), 'support.report_submitted', 'support', null);
end;
$$;

-- Everything support may know about one user: server metadata + numeric posture. No contents.
create or replace function public.admin_user_insights(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return jsonb_build_object(
    'providers', (select coalesce(jsonb_agg(distinct i.provider), '[]'::jsonb) from auth.identities i where i.user_id = p_user),
    'mfa_factors', (select count(*) from auth.mfa_factors f where f.user_id = p_user and f.status = 'verified'),
    'mfa_required', private.mfa_required(p_user),
    'sessions', (select count(*) from auth.sessions s where s.user_id = p_user and (s.not_after is null or s.not_after > now())),
    'last_session_activity', (select max(coalesce(s.refreshed_at::timestamptz, s.updated_at)) from auth.sessions s where s.user_id = p_user),
    'vault', (select jsonb_build_object('kdf_iterations', (p.kdf ->> 'iterations')::int, 'recovery', p.wrapped_dek_recovery is not null,
                                        'created_at', p.created_at, 'updated_at', p.updated_at)
              from public.vault_profiles p where p.user_id = p_user),
    'entries_v1', (select count(*) from public.vault_entries e where e.user_id = p_user and e.version = 1),
    'entries_v2', (select count(*) from public.vault_entries e where e.user_id = p_user and e.version = 2),
    'sharing_keys', exists (select 1 from public.user_keys k where k.user_id = p_user),
    'files', (select count(*) from public.vault_files f where f.owner_id = p_user and f.status = 'ready'),
    'storage_bytes', (select coalesce(sum(f.size_bytes), 0) from public.vault_files f where f.owner_id = p_user and f.status = 'ready'),
    'storage_backends', (select coalesce(jsonb_object_agg(b, n), '{}'::jsonb) from (
        select f.storage_backend b, count(*) n from public.vault_files f where f.owner_id = p_user group by 1) x),
    'item_shares_out', (select count(*) from public.item_shares s where s.owner_id = p_user),
    'item_shares_in', (select count(*) from public.item_shares s where s.recipient_id = p_user),
    'file_shares_out', (select count(*) from public.file_shares s where s.owner_id = p_user),
    'active_transfers', (select count(*) from public.transfers t where t.owner_id = p_user and not t.revoked and t.expires_at > now()),
    'folders', (select count(*) from public.vault_folders v where v.user_id = p_user),
    'posture', (select jsonb_build_object('data', ps.data, 'reported_at', ps.reported_at) from public.posture_snapshots ps where ps.user_id = p_user),
    'metrics_sharing', coalesce((select share_security_metrics from public.user_preferences where user_id = p_user), true),
    'events_30d', (select coalesce(jsonb_object_agg(event, n), '{}'::jsonb) from (
        select a.event, count(*) n from public.audit_events a
        where a.user_id = p_user and a.created_at > now() - interval '30 days' group by 1) x),
    'reports', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'report', r.report, 'created_at', r.created_at) order by r.created_at desc), '[]'::jsonb)
                from (select * from public.support_reports where user_id = p_user order by created_at desc limit 10) r)
  );
end;
$$;

-- Platform-wide compliance checks (pass / warn / fail with counts).
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
      jsonb_build_object('key', 'posture_reporting_users', 'value', (select count(*) from public.posture_snapshots))
    )
  );
end;
$$;

-- Global, read-only event feed for support (metadata only).
create or replace function public.admin_events(p_prefix text default '', p_user uuid default null, p_limit integer default 200)
returns table (id bigint, user_id uuid, user_email text, actor_id uuid, event text, target_type text, source text, details jsonb, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
    select a.id, a.user_id, u.email::text, a.actor_id, a.event, a.target_type, a.source, a.details, a.created_at
    from public.audit_events a
    left join auth.users u on u.id = a.user_id
    where (p_prefix = '' or a.event like p_prefix || '%')
      and (p_user is null or a.user_id = p_user)
    order by a.created_at desc
    limit least(greatest(p_limit, 1), 500);
end;
$$;

-- Users list gains role, providers and MFA policy.
drop function if exists public.admin_list_users(text, integer, integer);
create or replace function public.admin_list_users(p_search text default '', p_limit integer default 50, p_offset integer default 0)
returns table (
  user_id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz, confirmed boolean, banned_until timestamptz,
  plan text, mfa_factors integer, has_vault boolean, recovery boolean, items integer, files integer, storage_bytes bigint,
  failed_unlocks_7d integer, client_errors_7d integer, role text, providers text[], mfa_required boolean, posture_score integer
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
      (select count(*)::int from public.audit_events a where a.user_id = u.id and a.event = 'client.error' and a.created_at > now() - interval '7 days'),
      (select ad.role from public.app_admins ad where ad.user_id = u.id and (ad.expires_at is null or ad.expires_at > now())),
      (select coalesce(array_agg(distinct i.provider::text), '{}') from auth.identities i where i.user_id = u.id),
      private.mfa_required(u.id),
      (select (ps.data ->> 'score')::int from public.posture_snapshots ps where ps.user_id = u.id)
    from auth.users u
    left join public.user_plans pl on pl.user_id = u.id
    where p_search = '' or u.email ilike '%' || p_search || '%'
    order by u.created_at desc
    limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end;
$$;

-- ================================================================== grants
do $$
declare f text;
begin
  foreach f in array array[
    'public.my_admin_status()', 'public.admin_list_roles()', 'public.owner_grant_role(uuid, text, integer, text)',
    'public.owner_revoke_role(uuid)', 'public.my_security_policy()', 'public.admin_set_user_policy(uuid, boolean)',
    'public.admin_set_setting(text, text)', 'public.report_posture(jsonb)', 'public.submit_support_report(text)',
    'public.admin_user_insights(uuid)', 'public.admin_compliance()', 'public.admin_events(text, uuid, integer)',
    'public.admin_list_users(text, integer, integer)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke all on function private.mfa_required(uuid) from public, anon, authenticated;
