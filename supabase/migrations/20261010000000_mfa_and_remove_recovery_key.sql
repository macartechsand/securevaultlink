-- 1) Recovery key removed by product decision: the master password is the only way to unlock.
--    Existing recovery wrappers are cleared so a leaked recovery key can no longer decrypt a vault.
alter table public.vault_profiles alter column wrapped_dek_recovery drop not null;
update public.vault_profiles set wrapped_dek_recovery = null where wrapped_dek_recovery is not null;

-- 2) MFA enforcement: users who enrolled a verified MFA factor must have an aal2 session to touch
--    their vault. Users without MFA keep working with aal1. RESTRICTIVE policies are AND-ed with the
--    existing owner policies, so isolation rules still apply.
drop policy if exists vault_profiles_require_mfa on public.vault_profiles;
create policy vault_profiles_require_mfa on public.vault_profiles
  as restrictive for all to authenticated
  using (
    array[(select auth.jwt()->>'aal')] <@ (
      select case when count(id) > 0 then array['aal2'] else array['aal1', 'aal2'] end
      from auth.mfa_factors
      where (select auth.uid()) = user_id and status = 'verified'
    )
  )
  with check (
    array[(select auth.jwt()->>'aal')] <@ (
      select case when count(id) > 0 then array['aal2'] else array['aal1', 'aal2'] end
      from auth.mfa_factors
      where (select auth.uid()) = user_id and status = 'verified'
    )
  );

drop policy if exists vault_entries_require_mfa on public.vault_entries;
create policy vault_entries_require_mfa on public.vault_entries
  as restrictive for all to authenticated
  using (
    array[(select auth.jwt()->>'aal')] <@ (
      select case when count(id) > 0 then array['aal2'] else array['aal1', 'aal2'] end
      from auth.mfa_factors
      where (select auth.uid()) = user_id and status = 'verified'
    )
  )
  with check (
    array[(select auth.jwt()->>'aal')] <@ (
      select case when count(id) > 0 then array['aal2'] else array['aal1', 'aal2'] end
      from auth.mfa_factors
      where (select auth.uid()) = user_id and status = 'verified'
    )
  );
