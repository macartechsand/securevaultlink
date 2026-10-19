-- MVP limits for 15 users on the Supabase Free plan (1 GB of file storage).
-- 15 users x 60 MB = 900 MB, leaving ~100 MB of headroom. Same values can be set in the app:
-- Administração -> Beta e limites. Run in the SQL Editor (requires 20261020000000_closed_beta.sql).
--
-- On the Supabase Pro plan (100 GB storage + daily backups), raise free_quota_mb (e.g. 500).

update public.app_settings set value = '15', updated_at = now() where key = 'max_users';
update public.app_settings set value = '60', updated_at = now() where key = 'free_quota_mb';
update public.app_settings set value = '200', updated_at = now() where key = 'premium_quota_mb';

-- Recommended for a productive MVP: require two-factor authentication for everyone.
-- update public.app_settings set value = 'true', updated_at = now() where key = 'require_mfa_all';

select key, value, updated_at from public.app_settings order by key;
