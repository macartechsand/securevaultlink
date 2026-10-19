-- Closed beta: invite-only sign-up, a hard cap on accounts, and quotas sized for the Supabase free
-- tier (1 GB of storage). All values are adjustable by admins without a new migration.
-- Requires 20261019000300_r2_storage.sql.

-- ------------------------------------------------------------------ settings
create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
alter table public.app_settings force row level security;
revoke all on public.app_settings from anon, authenticated, public;
-- No policies: only security definer functions read or change settings.

insert into public.app_settings (key, value) values
  ('signup_mode', 'allowlist'),      -- 'allowlist' (invite-only) or 'open'
  ('max_users', '10'),
  ('free_quota_mb', '80'),           -- 10 users x 80 MB = 800 MB of the 1 GB free tier
  ('premium_quota_mb', '200')        -- raise once premium files go to Cloudflare R2
on conflict (key) do nothing;

create or replace function private.setting(p_key text, p_default text) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select value from public.app_settings where key = p_key), p_default)
$$;

create or replace function private.file_quota_bytes(p_user uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select (case private.user_plan(p_user)
            when 'premium' then private.setting('premium_quota_mb', '200')
            else private.setting('free_quota_mb', '80') end)::bigint * 1024 * 1024
$$;

-- ------------------------------------------------------------------ invite list
create table if not exists public.beta_allowlist (
  email text primary key check (email = lower(email) and position('@' in email) > 1),
  note text check (length(note) <= 200),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.beta_allowlist enable row level security;
alter table public.beta_allowlist force row level security;
revoke all on public.beta_allowlist from anon, authenticated, public;

-- Runs on every sign-up (including users created in the dashboard): enforces the invite list and
-- the account cap. Existing users are not affected.
create or replace function private.enforce_beta_signup() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.setting('signup_mode', 'allowlist') = 'allowlist'
     and not exists (select 1 from public.beta_allowlist where email = lower(new.email)) then
    raise exception 'SIGNUP_NOT_INVITED: this email has not been invited to the beta';
  end if;
  if (select count(*) from auth.users) >= private.setting('max_users', '10')::int then
    raise exception 'SIGNUP_LIMIT_REACHED: the beta is full';
  end if;
  return new;
end;
$$;
drop trigger if exists enforce_beta_signup on auth.users;
create trigger enforce_beta_signup before insert on auth.users
  for each row execute function private.enforce_beta_signup();

-- ------------------------------------------------------------------ admin functions
create or replace function public.admin_get_settings() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return jsonb_build_object(
    'settings', (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.app_settings),
    'users', (select count(*) from auth.users),
    'invites', (select coalesce(jsonb_agg(jsonb_build_object(
        'email', a.email, 'note', a.note, 'created_at', a.created_at,
        'registered', exists (select 1 from auth.users u where lower(u.email) = a.email))
        order by a.created_at desc), '[]'::jsonb) from public.beta_allowlist a)
  );
end;
$$;

create or replace function public.admin_set_setting(p_key text, p_value text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin('admin');
  if p_key = 'signup_mode' and p_value not in ('allowlist', 'open') then
    raise exception 'signup_mode must be allowlist or open';
  elsif p_key in ('max_users', 'free_quota_mb', 'premium_quota_mb') and (p_value !~ '^\d{1,6}$' or p_value::int < 1) then
    raise exception '% must be a positive integer', p_key;
  elsif p_key not in ('signup_mode', 'max_users', 'free_quota_mb', 'premium_quota_mb') then
    raise exception 'Unknown setting';
  end if;
  insert into public.app_settings (key, value, updated_at) values (p_key, p_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  perform private.audit(auth.uid(), 'admin.setting_changed', 'setting', p_key, jsonb_build_object('value', p_value));
end;
$$;

create or replace function public.admin_invite(p_email text, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e text := lower(trim(p_email));
begin
  perform private.require_admin('admin');
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Invalid email';
  end if;
  insert into public.beta_allowlist (email, note, invited_by) values (e, left(p_note, 200), auth.uid())
  on conflict (email) do update set note = excluded.note;
  perform private.audit(auth.uid(), 'admin.invited', 'invite', e);
end;
$$;

create or replace function public.admin_uninvite(p_email text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin('admin');
  delete from public.beta_allowlist where email = lower(trim(p_email));
  perform private.audit(auth.uid(), 'admin.uninvited', 'invite', lower(trim(p_email)));
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['public.admin_get_settings()', 'public.admin_set_setting(text, text)',
                           'public.admin_invite(text, text)', 'public.admin_uninvite(text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke all on function private.setting(text, text), private.enforce_beta_signup() from public, anon, authenticated;

-- Invite the accounts that already exist so they keep working (and count toward the cap).
insert into public.beta_allowlist (email, note)
select lower(email), 'conta existente antes do beta' from auth.users where email is not null
on conflict (email) do nothing;
