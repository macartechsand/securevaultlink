-- Fixes found by files.integration.test.ts on the dev project (2026-10-18):
--
-- 1) "infinite recursion detected in policy for relation file_shares": the file_shares INSERT
--    policy read vault_files, whose SELECT policy read file_shares. The cross-table checks now run
--    in SECURITY DEFINER helpers (which bypass RLS), breaking the cycle.
--
-- 2) Supabase grants ALL on public tables to `authenticated` by default; the previous migration
--    only revoked from anon/public, so column-level grants were ineffective. An owner could set
--    vault_files.status/size_bytes (bypassing finalize and quota) or reset a transfer's
--    download counter. Privileges are now reset and granted precisely.

-- ------------------------------------------------------------------ privileges
revoke all on public.user_keys, public.vault_files, public.file_shares, public.transfers from authenticated;

grant select, insert on public.user_keys to authenticated;
grant select, insert, delete on public.vault_files to authenticated;
grant update (encrypted_meta) on public.vault_files to authenticated;
grant select, insert, delete on public.file_shares to authenticated;
grant select, insert, delete on public.transfers to authenticated;
grant update (revoked) on public.transfers to authenticated;

-- Same hardening for the password-vault tables (updates there are legitimate, but limit columns).
revoke all on public.vault_profiles, public.vault_entries from authenticated;
grant select, insert on public.vault_profiles to authenticated;
grant update (version, kdf, wrapped_dek_password) on public.vault_profiles to authenticated;
grant select, insert, delete on public.vault_entries to authenticated;
grant update (ciphertext, iv, version) on public.vault_entries to authenticated;

-- ------------------------------------------------------------------ helpers (break RLS cycles)
create or replace function private.owns_shareable_file(p_file_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.vault_files f
    where f.id = p_file_id and f.owner_id = auth.uid() and f.kind = 'vault' and f.status = 'ready'
  )
$$;

create or replace function private.owns_file(p_file_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.vault_files f where f.id = p_file_id and f.owner_id = auth.uid())
$$;

create or replace function private.is_file_recipient(p_file_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.file_shares s where s.file_id = p_file_id and s.recipient_id = auth.uid()
  )
$$;

create or replace function private.can_read_object(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.vault_files f
    join public.file_shares s on s.file_id = f.id
    where f.storage_path = p_name and s.recipient_id = auth.uid()
  )
$$;

create or replace function private.owns_pending_upload(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.vault_files f
    where f.storage_path = p_name and f.owner_id = auth.uid() and f.status = 'pending'
  )
$$;

revoke all on function private.owns_shareable_file(uuid), private.owns_file(uuid),
  private.is_file_recipient(uuid), private.can_read_object(text), private.owns_pending_upload(text)
  from public, anon;
grant execute on function private.owns_shareable_file(uuid), private.owns_file(uuid),
  private.is_file_recipient(uuid), private.can_read_object(text), private.owns_pending_upload(text)
  to authenticated;

-- ------------------------------------------------------------------ policies
drop policy if exists vault_files_select on public.vault_files;
create policy vault_files_select on public.vault_files for select to authenticated using (
  (select auth.uid()) = owner_id or private.is_file_recipient(id)
);

drop policy if exists file_shares_insert on public.file_shares;
create policy file_shares_insert on public.file_shares for insert to authenticated with check (
  (select auth.uid()) = owner_id and private.owns_shareable_file(file_id)
);

drop policy if exists transfers_insert on public.transfers;
create policy transfers_insert on public.transfers for insert to authenticated with check (
  (select auth.uid()) = owner_id and download_count = 0 and not revoked and private.owns_file(file_id)
);

drop policy if exists vault_files_object_insert on storage.objects;
create policy vault_files_object_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'vault-files'
  and (select private.vault_mfa_satisfied())
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and private.owns_pending_upload(name)
);

drop policy if exists vault_files_object_select on storage.objects;
create policy vault_files_object_select on storage.objects for select to authenticated using (
  bucket_id = 'vault-files'
  and (select private.vault_mfa_satisfied())
  and ((storage.foldername(name))[1] = (select auth.uid())::text or private.can_read_object(name))
);
