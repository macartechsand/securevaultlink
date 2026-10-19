-- Fix: the aal2 policies queried auth.mfa_factors directly, but the `authenticated` role has no
-- SELECT on that table ("permission denied for table mfa_factors").
-- The check now runs in a SECURITY DEFINER function in a non-exposed schema. It only answers
-- "does the current session satisfy MFA?" for the caller; it never returns factor data.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.vault_mfa_satisfied() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
    or not exists (
      select 1
      from auth.mfa_factors f
      where f.user_id = auth.uid() and f.status = 'verified'
    );
$$;

revoke all on function private.vault_mfa_satisfied() from public, anon;
grant execute on function private.vault_mfa_satisfied() to authenticated;

drop policy if exists vault_profiles_require_mfa on public.vault_profiles;
create policy vault_profiles_require_mfa on public.vault_profiles
  as restrictive for all to authenticated
  using ((select private.vault_mfa_satisfied()))
  with check ((select private.vault_mfa_satisfied()));

drop policy if exists vault_entries_require_mfa on public.vault_entries;
create policy vault_entries_require_mfa on public.vault_entries
  as restrictive for all to authenticated
  using ((select private.vault_mfa_satisfied()))
  with check ((select private.vault_mfa_satisfied()));
