-- Licenses: Premium seats (default 10, admin-editable), license assignment with optional duration and
-- note, seat enforcement, and a summary for the admin "Licenças" tab.
-- Requires 20261023000000_premium_invites.sql.

-- ------------------------------------------------------------------ settings and columns
insert into public.app_settings (key, value) values ('premium_seats', '10') on conflict (key) do nothing;

alter table public.user_plans add column if not exists granted_by uuid references auth.users (id) on delete set null;
alter table public.user_plans add column if not exists note text check (length(note) <= 200);

-- Users read only their own plan and end date (not the admin's note or who granted it).
revoke select on public.user_plans from authenticated;
grant select (user_id, plan, expires_at, updated_at) on public.user_plans to authenticated;

-- Premium licenses in use right now (expired ones free their seat automatically).
create or replace function private.premium_in_use() returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.user_plans where plan = 'premium' and (expires_at is null or expires_at > now())
$$;

create or replace function private.has_premium(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.user_plan(p_user) = 'premium'
$$;

-- ------------------------------------------------------------------ grant (seat-aware)
drop function if exists private.grant_plan(uuid, text, integer, text);
create or replace function private.grant_plan(
  p_user uuid, p_plan text, p_days integer, p_event text, p_note text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  ends timestamptz := case when p_plan = 'premium' and p_days is not null then now() + make_interval(days => p_days) end;
begin
  -- A new Premium needs a free seat; renewing or changing the end date of an active one does not.
  if p_plan = 'premium' and not private.has_premium(p_user)
     and private.premium_in_use() >= private.setting('premium_seats', '10')::int then
    raise exception 'PREMIUM_SEATS_FULL: all Premium licenses are in use';
  end if;
  insert into public.user_plans (user_id, plan, expires_at, updated_at, granted_by, note)
  values (p_user, p_plan, ends, now(), auth.uid(), left(p_note, 200))
  on conflict (user_id) do update
    set plan = excluded.plan, expires_at = excluded.expires_at, updated_at = now(),
        granted_by = excluded.granted_by, note = coalesce(excluded.note, public.user_plans.note);
  perform private.audit(p_user, p_event, 'user', p_user::text,
    jsonb_build_object('plan', p_plan, 'days', p_days, 'expires_at', ends, 'note', left(p_note, 200)));
end;
$$;

-- Sign-up must never fail because of a license: without a free seat the invite becomes Free (audited).
create or replace function private.apply_invite_plan() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  inv record;
begin
  select plan, premium_days into inv from public.beta_allowlist where email = lower(new.email);
  if found and inv.plan = 'premium' then
    if private.premium_in_use() >= private.setting('premium_seats', '10')::int then
      perform private.audit(new.id, 'plan.invite_seat_unavailable', 'user', new.id::text, '{}'::jsonb);
    else
      perform private.grant_plan(new.id, 'premium', inv.premium_days, 'plan.granted_by_invite', 'convite Premium');
    end if;
  end if;
  return new;
end;
$$;

-- ------------------------------------------------------------------ admin functions
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
  select id into existing from auth.users where lower(email) = e;
  if existing is not null and p_plan = 'premium' then
    perform private.grant_plan(existing, 'premium', p_premium_days, 'plan.granted_by_invite', p_note);
  end if;
end;
$$;

-- License assignment from the admin panel. p_days = null: no end date.
drop function if exists public.admin_set_plan(uuid, text);
create or replace function public.admin_set_plan(p_user uuid, p_plan text, p_days integer default null, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin('admin');
  if p_plan not in ('free', 'premium') then
    raise exception 'Invalid plan';
  end if;
  if p_days is not null and (p_plan <> 'premium' or p_days not between 1 and 3650) then
    raise exception 'days must be between 1 and 3650 and only for premium';
  end if;
  if not exists (select 1 from auth.users where id = p_user) then
    raise exception 'User not found';
  end if;
  perform private.grant_plan(p_user, p_plan, p_days, 'admin.plan_changed', p_note);
end;
$$;

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
  elsif p_key = 'premium_seats' and (p_value !~ '^\d{1,6}$') then
    raise exception 'premium_seats must be zero or a positive integer';
  elsif p_key not in ('signup_mode', 'max_users', 'free_quota_mb', 'premium_quota_mb', 'require_mfa_all', 'premium_seats') then
    raise exception 'Unknown setting';
  end if;
  insert into public.app_settings (key, value, updated_at) values (p_key, p_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  perform private.audit(auth.uid(), 'admin.setting_changed', 'setting', p_key, jsonb_build_object('value', p_value));
end;
$$;

-- Seats, usage and what needs attention (metadata only).
create or replace function public.admin_license_summary() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return jsonb_build_object(
    'seats', private.setting('premium_seats', '10')::int,
    'premium_in_use', private.premium_in_use(),
    'users', (select count(*) from auth.users),
    'max_users', private.setting('max_users', '10')::int,
    'expiring_7d', (select coalesce(jsonb_agg(jsonb_build_object('user_id', p.user_id, 'email', u.email, 'expires_at', p.expires_at) order by p.expires_at), '[]'::jsonb)
                    from public.user_plans p join auth.users u on u.id = p.user_id
                    where p.plan = 'premium' and p.expires_at > now() and p.expires_at <= now() + interval '7 days'),
    'expired_30d', (select count(*) from public.user_plans
                    where plan = 'premium' and expires_at <= now() and expires_at > now() - interval '30 days'),
    'pending_premium_invites', (select count(*) from public.beta_allowlist a
                                where a.plan = 'premium' and not exists (select 1 from auth.users u where lower(u.email) = a.email)),
    'licenses', (select coalesce(jsonb_agg(jsonb_build_object(
                    'user_id', p.user_id, 'note', p.note, 'updated_at', p.updated_at,
                    'granted_by', (select g.email from auth.users g where g.id = p.granted_by))), '[]'::jsonb)
                 from public.user_plans p)
  );
end;
$$;

-- ------------------------------------------------------------------ grants
do $$
declare f text;
begin
  foreach f in array array['public.admin_invite(text, text, text, integer)', 'public.admin_set_plan(uuid, text, integer, text)',
                           'public.admin_set_setting(text, text)', 'public.admin_license_summary()'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke all on function private.grant_plan(uuid, text, integer, text, text), private.premium_in_use(), private.has_premium(uuid)
  from public, anon, authenticated;
