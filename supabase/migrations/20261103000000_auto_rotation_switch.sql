-- Confidentiality: a platform-wide switch for automatic (server-side) rotation.
-- Automatic rotation is the only path where the server handles a credential in clear text (for a few
-- seconds, never stored). With the switch off, the `rotate` function refuses every request and the
-- platform never sees any vault secret; assisted rotation (in the browser) keeps working.
-- Requires 20261102000000_beta_scope_audit_integrity.sql.

-- New installs (production) start with it OFF; a project that already used it keeps it ON.
insert into public.app_settings (key, value)
select 'auto_rotation',
       case when exists (select 1 from public.audit_events where event like 'rotation.%') then 'on' else 'off' end
on conflict (key) do nothing;

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
  elsif p_key in ('max_users', 'free_quota_mb', 'premium_quota_mb') and (p_value !~ '^\d{1,6}$' or p_value::int < 1) then
    raise exception '% must be a positive integer', p_key;
  elsif p_key = 'premium_seats' and (p_value !~ '^\d{1,6}$') then
    raise exception 'premium_seats must be zero or a positive integer';
  elsif p_key not in ('signup_mode', 'max_users', 'free_quota_mb', 'premium_quota_mb', 'require_mfa_all', 'premium_seats', 'auto_rotation') then
    raise exception 'Unknown setting';
  end if;
  insert into public.app_settings (key, value, updated_at) values (p_key, p_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  perform private.audit(auth.uid(), 'admin.setting_changed', 'setting', p_key, jsonb_build_object('value', p_value));
end;
$$;
