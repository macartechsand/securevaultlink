-- Premium invites: the admin chooses the plan (and optionally how many days of Premium) when adding
-- an e-mail to the invite list. The plan is applied when that person signs up (or immediately if
-- the account already exists). Invites still count toward max_users (enforced by
-- enforce_beta_signup). Premium with an end date turns back into Free automatically.
-- Requires 20261022000000_vault_status.sql.

-- ------------------------------------------------------------------ columns
alter table public.beta_allowlist add column if not exists plan text not null default 'free'
  check (plan in ('free', 'premium'));
alter table public.beta_allowlist add column if not exists premium_days integer
  check (premium_days between 1 and 3650);
-- null = no end date. Set only by the functions below (clients have select on user_plans only).
alter table public.user_plans add column if not exists expires_at timestamptz;

-- Expired Premium counts as Free everywhere (quotas, share durations, R2, UI limits).
create or replace function private.user_plan(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select plan from public.user_plans
                   where user_id = p_user and (expires_at is null or expires_at > now())), 'free')
$$;

create or replace function private.grant_plan(p_user uuid, p_plan text, p_days integer, p_event text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  ends timestamptz := case when p_plan = 'premium' and p_days is not null then now() + make_interval(days => p_days) end;
begin
  insert into public.user_plans (user_id, plan, expires_at, updated_at) values (p_user, p_plan, ends, now())
  on conflict (user_id) do update set plan = excluded.plan, expires_at = excluded.expires_at, updated_at = now();
  perform private.audit(p_user, p_event, 'user', p_user::text,
    jsonb_build_object('plan', p_plan, 'days', p_days, 'expires_at', ends));
end;
$$;

-- ------------------------------------------------------------------ apply on sign-up
create or replace function private.apply_invite_plan() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  inv record;
begin
  select plan, premium_days into inv from public.beta_allowlist where email = lower(new.email);
  if found and inv.plan = 'premium' then
    perform private.grant_plan(new.id, 'premium', inv.premium_days, 'plan.granted_by_invite');
  end if;
  return new;
end;
$$;
drop trigger if exists apply_invite_plan on auth.users;
create trigger apply_invite_plan after insert on auth.users
  for each row execute function private.apply_invite_plan();

-- ------------------------------------------------------------------ admin functions
drop function if exists public.admin_invite(text, text);
create or replace function public.admin_invite(
  p_email text, p_note text default null, p_plan text default 'free', p_premium_days integer default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e text := lower(trim(p_email));
  existing uuid;
begin
  perform private.require_admin('admin');
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Invalid email';
  end if;
  if p_plan not in ('free', 'premium') then
    raise exception 'Invalid plan';
  end if;
  if p_premium_days is not null and (p_plan <> 'premium' or p_premium_days not between 1 and 3650) then
    raise exception 'premium_days must be between 1 and 3650 and only for premium';
  end if;
  insert into public.beta_allowlist (email, note, invited_by, plan, premium_days)
  values (e, left(p_note, 200), auth.uid(), p_plan, p_premium_days)
  on conflict (email) do update
    set note = coalesce(excluded.note, public.beta_allowlist.note), plan = excluded.plan, premium_days = excluded.premium_days;
  perform private.audit(auth.uid(), 'admin.invited', 'invite', e, jsonb_build_object('plan', p_plan, 'days', p_premium_days));
  -- Already has an account: a Premium invite upgrades it now (a Free invite never downgrades).
  select id into existing from auth.users where lower(email) = e;
  if existing is not null and p_plan = 'premium' then
    perform private.grant_plan(existing, 'premium', p_premium_days, 'plan.granted_by_invite');
  end if;
end;
$$;

-- Manual plan changes are permanent (they clear any end date).
create or replace function public.admin_set_plan(p_user uuid, p_plan text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin('admin');
  if p_plan not in ('free', 'premium') then
    raise exception 'Invalid plan';
  end if;
  perform private.grant_plan(p_user, p_plan, null, 'admin.plan_changed');
end;
$$;

create or replace function public.admin_get_settings() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return jsonb_build_object(
    'settings', (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.app_settings),
    'users', (select count(*) from auth.users),
    'invites', (select coalesce(jsonb_agg(jsonb_build_object(
        'email', a.email, 'note', a.note, 'created_at', a.created_at, 'plan', a.plan, 'premium_days', a.premium_days,
        'registered', exists (select 1 from auth.users u where lower(u.email) = a.email))
        order by a.created_at desc), '[]'::jsonb) from public.beta_allowlist a)
  );
end;
$$;

-- Overview and users list use the effective plan (expired Premium = Free) and show the end date.
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
    'premium_users', (select count(*) from public.user_plans where plan = 'premium' and (expires_at is null or expires_at > now())),
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

drop function if exists public.admin_list_users(text, integer, integer);
create or replace function public.admin_list_users(p_search text default '', p_limit integer default 50, p_offset integer default 0)
returns table (
  user_id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz, confirmed boolean, banned_until timestamptz,
  plan text, mfa_factors integer, has_vault boolean, recovery boolean, items integer, files integer, storage_bytes bigint,
  failed_unlocks_7d integer, client_errors_7d integer, role text, providers text[], mfa_required boolean, posture_score integer,
  plan_expires_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
    select u.id, u.email::text, u.created_at, u.last_sign_in_at, u.email_confirmed_at is not null, u.banned_until,
      private.user_plan(u.id),
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
      (select (ps.data ->> 'score')::int from public.posture_snapshots ps where ps.user_id = u.id),
      (select pl.expires_at from public.user_plans pl where pl.user_id = u.id and pl.plan = 'premium' and pl.expires_at > now())
    from auth.users u
    where p_search = '' or u.email ilike '%' || p_search || '%'
    order by u.created_at desc
    limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end;
$$;

-- The user's own limits now also say when Premium ends.
drop function if exists public.my_plan_limits();
create or replace function public.my_plan_limits() returns table (
  plan text, quota_bytes bigint, max_file_bytes bigint, max_share_hours integer, max_transfer_hours integer, plan_expires_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select private.user_plan(auth.uid()), private.file_quota_bytes(auth.uid()), private.max_file_bytes(auth.uid()),
         private.max_share_hours(auth.uid()), private.max_share_hours(auth.uid()),
         (select pl.expires_at from public.user_plans pl where pl.user_id = auth.uid() and pl.plan = 'premium' and pl.expires_at > now())
  where auth.uid() is not null
$$;

-- ------------------------------------------------------------------ grants
do $$
declare f text;
begin
  foreach f in array array['public.admin_invite(text, text, text, integer)', 'public.admin_set_plan(uuid, text)',
                           'public.admin_get_settings()', 'public.admin_overview()',
                           'public.admin_list_users(text, integer, integer)', 'public.my_plan_limits()'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke all on function private.grant_plan(uuid, text, integer, text), private.apply_invite_plan() from public, anon, authenticated;
