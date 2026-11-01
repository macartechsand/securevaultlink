-- Phase F: Cloudflare R2 as storage backend for premium users.
-- Objects are encrypted client-side exactly as on Supabase Storage; R2 only stores ciphertext.
-- Upload/download use short-lived presigned URLs issued by the storage-r2 Edge Function.
-- Requires 20261019000200_admin_troubleshooting.sql.

alter table public.vault_files drop constraint if exists vault_files_storage_backend_check;
alter table public.vault_files add constraint vault_files_storage_backend_check
  check (storage_backend in ('supabase', 's3', 'r2'));

-- Clients may now choose the backend on insert, but only premium users can use R2.
grant insert (id, kind, chunk_size, size_bytes, encrypted_meta, wrapped_key, storage_backend, storage_class, storage_path, expires_at)
  on public.vault_files to authenticated;

drop policy if exists vault_files_insert on public.vault_files;
create policy vault_files_insert on public.vault_files for insert to authenticated with check (
  (select auth.uid()) = owner_id
  and status = 'pending'
  and (storage_backend = 'supabase' or (storage_backend = 'r2' and private.user_plan(auth.uid()) = 'premium'))
);

-- finalize_vault_file only applies to Supabase Storage objects; R2 uploads are finalized by the
-- storage-r2 function (it checks the object size with a HEAD request).
create or replace function public.finalize_vault_file(p_file_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  f public.vault_files;
  actual bigint;
begin
  if not private.vault_mfa_satisfied() then
    raise exception 'MFA required';
  end if;
  select * into f from public.vault_files where id = p_file_id and owner_id = auth.uid() for update;
  if not found then
    raise exception 'File not found';
  end if;
  if f.status <> 'pending' then
    return f.status;
  end if;
  if f.storage_backend <> 'supabase' then
    raise exception 'Use the storage function to finalize this upload';
  end if;
  select (metadata ->> 'size')::bigint into actual
  from storage.objects where bucket_id = 'vault-files' and name = f.storage_path;
  if actual is null then
    raise exception 'Upload not found';
  end if;
  if actual <> f.size_bytes then
    update public.vault_files set status = 'rejected' where id = f.id;
    return 'rejected';
  end if;
  update public.vault_files set status = 'ready' where id = f.id;
  return 'ready';
end;
$$;
