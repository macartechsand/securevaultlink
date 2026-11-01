-- Master administrator setup (run in the Supabase SQL Editor, development project).
-- Not a migration: it targets one specific person. Replace the e-mail on BOTH places below.
--
-- Order:
--   STEP 1 (this file, part A)  -> authorizes the e-mail in the closed beta
--   STEP 2 (dashboard)          -> Authentication -> Users -> Add user -> Create new user,
--                                  same e-mail, a strong unique password, "Auto Confirm User" ON
--   STEP 3 (this file, part B)  -> grants the admin role
--   STEP 4 (app)                -> sign in, create the vault, enable two-factor authentication in
--                                  Configurações, sign out and in again with the code. The
--                                  "Administração" menu appears (admin functions require MFA).

-- ---------------------------------------------------------------- PART A (before creating the user)
do $$
begin
  if to_regclass('public.beta_allowlist') is not null then
    insert into public.beta_allowlist (email, note)
    values (lower('ADMIN-EMAIL@EXAMPLE.COM'), 'administrador master')
    on conflict (email) do update set note = excluded.note;
  end if;
end $$;

-- ---------------------------------------------------------------- PART B (after creating the user)
insert into public.app_admins (user_id, role)
select id, 'admin' from auth.users where lower(email) = lower('ADMIN-EMAIL@EXAMPLE.COM')
on conflict (user_id) do update set role = 'admin';

-- Check: must return exactly one row with role = admin.
select u.email, a.role, a.created_at
from public.app_admins a join auth.users u on u.id = a.user_id;
