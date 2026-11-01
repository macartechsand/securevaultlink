-- Vault status for the signed-in user, independent of RLS: lets the app distinguish "no vault yet"
-- from "vault exists but is blocked by the MFA policy", so existing users are never shown the
-- "create your master password" screen. Returns booleans only (no key material).
-- Requires 20261021000000_iam_pam_support.sql.

create or replace function public.my_vault_status()
returns table (has_profile boolean, mfa_satisfied boolean, mfa_required boolean, has_factor boolean)
language sql stable security definer set search_path = '' as $$
  select
    exists (select 1 from public.vault_profiles p where p.user_id = auth.uid()),
    private.vault_mfa_satisfied(),
    private.mfa_required(auth.uid()),
    exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified')
  where auth.uid() is not null
$$;
revoke all on function public.my_vault_status() from public, anon;
grant execute on function public.my_vault_status() to authenticated;
