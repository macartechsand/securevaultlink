-- Entitlements enforced by the database (docs/product/plan-strategy.md):
--   - items per plan (Free = 7 by default). Reaching the limit only blocks NEW items: existing items
--     stay readable, editable, shareable and exportable, and a downgrade never locks data;
--   - daily URL-reputation checks per plan (fair use), counted in the database instead of in the
--     memory of each Edge Function instance.
-- Counters hold numbers only (user, metric, day, count): no vault content, no URLs.
-- All values are admin-editable settings. Requires 20261103000000_auto_rotation_switch.sql.

insert into public.app_settings (key, value) values
  ('free_max_items', '7'),
  ('premium_max_items', '10000'),          -- fair use
  ('free_url_checks_day', '50'),
  ('premium_url_checks_day', '1000')
on conflict (key) do nothing;

create or replace function private.plan_limit(p_user uuid, p_resource text) returns integer
language sql stable security definer set search_path = '' as $$
  select private.setting(
           (case private.user_plan(p_user) when 'premium' then 'premium_' else 'free_' end) || p_resource,
           case p_resource when 'max_items' then '7' when 'url_checks_day' then '50' else '0' end
         )::integer
$$;
revoke all on function private.plan_limit(uuid, text) from public, anon, authenticated;

-- ------------------------------------------------------------------ items per plan
create or replace function private.enforce_item_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  lim integer := private.plan_limit(new.user_id, 'max_items');
begin
  -- Serializes concurrent inserts of the same owner so two tabs cannot both pass the check.
  perform pg_advisory_xact_lock(hashtext('vault_items:' || new.user_id::text));
  if (select count(*) from public.vault_entries where user_id = new.user_id) >= lim then
    raise exception 'ITEM_LIMIT_REACHED: % items allowed on this plan', lim using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_item_limit() from public, anon, authenticated;

drop trigger if exists vault_entries_item_limit on public.vault_entries;
create trigger vault_entries_item_limit before insert on public.vault_entries
  for each row execute function private.enforce_item_limit();

-- ------------------------------------------------------------------ usage counters
create table if not exists private.usage_counters (
  user_id uuid not null references auth.users (id) on delete cascade,
  metric text not null check (metric in ('url_checks')),
  day date not null default current_date,
  count integer not null default 0 check (count >= 0),
  primary key (user_id, metric, day)
);
revoke all on private.usage_counters from public, anon, authenticated;

-- Reserves p_count URL checks for the caller today. Returns false (and reserves nothing) when the
-- plan's daily allowance would be exceeded. Called by the check-url function with the user's JWT.
create or replace function public.consume_url_checks(p_count integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  lim integer;
  used integer;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_count is null or p_count < 1 or p_count > 50 then raise exception 'invalid count'; end if;
  lim := private.plan_limit(me, 'url_checks_day');
  delete from private.usage_counters where user_id = me and day < current_date - 31;
  insert into private.usage_counters (user_id, metric, day, count) values (me, 'url_checks', current_date, 0)
  on conflict do nothing;
  select count into used from private.usage_counters
   where user_id = me and metric = 'url_checks' and day = current_date for update;
  if used + p_count > lim then return false; end if;
  update private.usage_counters set count = count + p_count
   where user_id = me and metric = 'url_checks' and day = current_date;
  return true;
end;
$$;
revoke all on function public.consume_url_checks(integer) from public, anon;
grant execute on function public.consume_url_checks(integer) to authenticated;

-- ------------------------------------------------------------------ what the app shows
create or replace function public.my_entitlements() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'plan', private.user_plan(auth.uid()),
    'max_items', private.plan_limit(auth.uid(), 'max_items'),
    'items', (select count(*) from public.vault_entries where user_id = auth.uid()),
    'url_checks_day', private.plan_limit(auth.uid(), 'url_checks_day'),
    'url_checks_used', coalesce((select count from private.usage_counters
                                  where user_id = auth.uid() and metric = 'url_checks' and day = current_date), 0)
  )
  where auth.uid() is not null
$$;
revoke all on function public.my_entitlements() from public, anon;
grant execute on function public.my_entitlements() to authenticated;

-- ------------------------------------------------------------------ admin settings
create or replace function public.admin_set_setting(p_key text, p_value text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin('admin');
  if p_key = 'signup_mode' and p_value not in ('allowlist', 'open') then
    raise exception 'signup_mode must be allowlist or open';
  elsif p_key = 'require_mfa_all' and p_value not in ('true', 'false') then
    raise exception 'require_mfa_all must be true or false';
  elsif p_key = 'auto_rotation' and p_value not in ('on', 'off') then
    raise exception 'auto_rotation must be on or off';
  elsif p_key in ('max_users', 'free_quota_mb', 'premium_quota_mb', 'free_max_items', 'premium_max_items',
                  'free_url_checks_day', 'premium_url_checks_day')
        and (p_value !~ '^\d{1,6}$' or p_value::int < 1) then
    raise exception '% must be a positive integer', p_key;
  elsif p_key = 'premium_seats' and (p_value !~ '^\d{1,6}$') then
    raise exception 'premium_seats must be zero or a positive integer';
  elsif p_key not in ('signup_mode', 'max_users', 'free_quota_mb', 'premium_quota_mb', 'require_mfa_all', 'premium_seats',
                      'auto_rotation', 'free_max_items', 'premium_max_items', 'free_url_checks_day', 'premium_url_checks_day') then
    raise exception 'Unknown setting';
  end if;
  insert into public.app_settings (key, value, updated_at) values (p_key, p_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  perform private.audit(auth.uid(), 'admin.setting_changed', 'setting', p_key, jsonb_build_object('value', p_value));
end;
$$;
