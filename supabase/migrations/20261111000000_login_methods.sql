-- Login methods (2026-11-11).
-- The admin user list tells whether an account has an account password at all, so an invited person who
-- opened the link but never saved a password (and therefore cannot sign in with e-mail and password, for
-- example in the Android app) is visible and can get a reset link. Only a boolean leaves the function.
-- Identity linking (Google/GitHub on the same account) is a Supabase Auth setting: Authentication →
-- Sign In / Providers → "Allow manual linking" (see docs/product/login-experience.md).

drop function if exists public.admin_list_users(text, integer, integer);
create or replace function public.admin_list_users(p_search text default '', p_limit integer default 50, p_offset integer default 0)
returns table (
  user_id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz, confirmed boolean, banned_until timestamptz,
  plan text, mfa_factors integer, has_vault boolean, recovery boolean, items integer, files integer, storage_bytes bigint,
  failed_unlocks_7d integer, client_errors_7d integer, role text, providers text[], mfa_required boolean, posture_score integer,
  plan_expires_at timestamptz, has_password boolean
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
      (select pl.expires_at from public.user_plans pl where pl.user_id = u.id and pl.plan = 'premium' and pl.expires_at > now()),
      -- Only whether a password exists (never the hash): an invited account that never saved one
      -- cannot sign in with e-mail and password (e.g. in the Android app).
      coalesce(u.encrypted_password, '') <> ''
    from auth.users u
    where p_search = '' or u.email ilike '%' || p_search || '%'
    order by u.created_at desc
    limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end;
$$;

revoke all on function public.admin_list_users(text, integer, integer) from public, anon;
grant execute on function public.admin_list_users(text, integer, integer) to authenticated;
