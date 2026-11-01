-- SecureVault: encrypted file vault, user-to-user sharing and temporary transfers.
-- Files are encrypted in the browser; the server stores only ciphertext and wrapped keys.
-- Requires 20261010000100_fix_mfa_policy_permissions.sql (private.vault_mfa_satisfied).

-- ------------------------------------------------------------------ plan limits
-- Free plan for the MVP. Later these read from a subscriptions table per user.
create or replace function private.file_quota_bytes(p_user uuid) returns bigint
language sql immutable set search_path = '' as $$ select 100::bigint * 1024 * 1024 $$;

-- 25 MiB of plaintext, plus 16 bytes of GCM tag per 1 MiB chunk.
create or replace function private.max_file_bytes(p_user uuid) returns bigint
language sql immutable set search_path = '' as $$ select 25::bigint * 1024 * 1024 + 26 * 16 $$;

-- ------------------------------------------------------------------ user key pairs
create table if not exists public.user_keys (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  algorithm text not null default 'ECDH-P256',
  public_key text not null check (length(public_key) <= 512),
  wrapped_private_key text not null check (length(wrapped_private_key) <= 1024),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ files
create table if not exists public.vault_files (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('vault', 'transfer')),
  status text not null default 'pending' check (status in ('pending', 'ready', 'rejected')),
  format_version integer not null default 1,
  chunk_size integer not null check (chunk_size between 65536 and 8388608),
  size_bytes bigint not null check (size_bytes >= 16),
  encrypted_meta text not null check (length(encrypted_meta) <= 4096),
  wrapped_key text not null check (length(wrapped_key) <= 512),
  storage_backend text not null default 'supabase' check (storage_backend in ('supabase', 's3')),
  storage_class text not null default 'standard',
  storage_path text not null unique,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  constraint vault_files_path check (storage_path = owner_id::text || '/' || id::text),
  constraint vault_files_transfer_expiry check (kind = 'vault' or expires_at is not null)
);
create index if not exists vault_files_owner_idx on public.vault_files (owner_id);

create table if not exists public.file_shares (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.vault_files (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  owner_email text,
  recipient_email text,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  sealed_key text not null check (length(sealed_key) <= 512),
  created_at timestamptz not null default now(),
  unique (file_id, recipient_id),
  check (recipient_id <> owner_id)
);
create index if not exists file_shares_recipient_idx on public.file_shares (recipient_id);

create table if not exists public.transfers (
  id uuid primary key,
  file_id uuid not null references public.vault_files (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  wrapped_key text not null check (length(wrapped_key) <= 512),
  password_salt text check (length(password_salt) <= 64),
  max_downloads integer not null check (max_downloads between 1 and 20),
  download_count integer not null default 0,
  revoked boolean not null default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (expires_at > created_at and expires_at <= created_at + interval '7 days')
);
create index if not exists transfers_owner_idx on public.transfers (owner_id);

-- ------------------------------------------------------------------ triggers
create or replace function private.enforce_file_quota() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  used bigint;
  files integer;
begin
  perform pg_advisory_xact_lock(hashtext('vault_files:' || new.owner_id::text));
  if new.size_bytes > private.max_file_bytes(new.owner_id) then
    raise exception 'File exceeds the per-file size limit';
  end if;
  select coalesce(sum(size_bytes), 0), count(*) into used, files
  from public.vault_files
  where owner_id = new.owner_id and status in ('pending', 'ready');
  if used + new.size_bytes > private.file_quota_bytes(new.owner_id) then
    raise exception 'Storage quota exceeded';
  end if;
  if files >= 500 then
    raise exception 'Too many files';
  end if;
  return new;
end;
$$;

drop trigger if exists vault_files_quota on public.vault_files;
create trigger vault_files_quota before insert on public.vault_files
  for each row execute function private.enforce_file_quota();

-- Emails are filled server-side (never trusted from the client).
create or replace function private.fill_share_owner_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select email into new.owner_email from auth.users where id = new.owner_id;
  select email into new.recipient_email from auth.users where id = new.recipient_id;
  return new;
end;
$$;

drop trigger if exists file_shares_owner_email on public.file_shares;
create trigger file_shares_owner_email before insert on public.file_shares
  for each row execute function private.fill_share_owner_email();

-- ------------------------------------------------------------------ RLS
alter table public.user_keys enable row level security;
alter table public.user_keys force row level security;
alter table public.vault_files enable row level security;
alter table public.vault_files force row level security;
alter table public.file_shares enable row level security;
alter table public.file_shares force row level security;
alter table public.transfers enable row level security;
alter table public.transfers force row level security;

revoke all on public.user_keys, public.vault_files, public.file_shares, public.transfers from anon, public;
grant select, insert on public.user_keys to authenticated;
grant select, insert, delete on public.vault_files to authenticated;
grant update (encrypted_meta) on public.vault_files to authenticated;
grant select, insert, delete on public.file_shares to authenticated;
grant select, insert, delete on public.transfers to authenticated;
grant update (revoked) on public.transfers to authenticated;

-- user_keys: owner only
drop policy if exists user_keys_own on public.user_keys;
create policy user_keys_own on public.user_keys for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists user_keys_insert_own on public.user_keys;
create policy user_keys_insert_own on public.user_keys for insert to authenticated with check ((select auth.uid()) = user_id);

-- vault_files: owner full access; recipients of a share can read the row
drop policy if exists vault_files_select on public.vault_files;
create policy vault_files_select on public.vault_files for select to authenticated using (
  (select auth.uid()) = owner_id
  or exists (
    select 1 from public.file_shares s
    where s.file_id = vault_files.id and s.recipient_id = (select auth.uid())
  )
);
drop policy if exists vault_files_insert on public.vault_files;
create policy vault_files_insert on public.vault_files for insert to authenticated
  with check ((select auth.uid()) = owner_id and status = 'pending');
drop policy if exists vault_files_update on public.vault_files;
create policy vault_files_update on public.vault_files for update to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists vault_files_delete on public.vault_files;
create policy vault_files_delete on public.vault_files for delete to authenticated using ((select auth.uid()) = owner_id);

-- file_shares: owner manages; recipient reads and can remove it from their list
drop policy if exists file_shares_select on public.file_shares;
create policy file_shares_select on public.file_shares for select to authenticated
  using ((select auth.uid()) in (owner_id, recipient_id));
drop policy if exists file_shares_insert on public.file_shares;
create policy file_shares_insert on public.file_shares for insert to authenticated with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.vault_files f
    where f.id = file_shares.file_id and f.owner_id = (select auth.uid()) and f.kind = 'vault' and f.status = 'ready'
  )
);
drop policy if exists file_shares_delete on public.file_shares;
create policy file_shares_delete on public.file_shares for delete to authenticated
  using ((select auth.uid()) in (owner_id, recipient_id));

-- transfers: owner only (anonymous downloads go through the transfer Edge Function)
drop policy if exists transfers_select on public.transfers;
create policy transfers_select on public.transfers for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists transfers_insert on public.transfers;
create policy transfers_insert on public.transfers for insert to authenticated with check (
  (select auth.uid()) = owner_id
  and download_count = 0
  and not revoked
  and exists (select 1 from public.vault_files f where f.id = transfers.file_id and f.owner_id = (select auth.uid()))
);
drop policy if exists transfers_update on public.transfers;
create policy transfers_update on public.transfers for update to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists transfers_delete on public.transfers;
create policy transfers_delete on public.transfers for delete to authenticated using ((select auth.uid()) = owner_id);

-- MFA (aal2) applies to every file table, as for the password vault.
do $$
declare t text;
begin
  foreach t in array array['user_keys', 'vault_files', 'file_shares', 'transfers'] loop
    execute format('drop policy if exists %I on public.%I', t || '_require_mfa', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated
         using ((select private.vault_mfa_satisfied())) with check ((select private.vault_mfa_satisfied()))',
      t || '_require_mfa', t);
  end loop;
end $$;

-- ------------------------------------------------------------------ functions
-- Recipient lookup by exact email. Returns only users who already have a sharing key.
create or replace function public.find_share_recipient(p_email text)
returns table (user_id uuid, public_key text)
language sql stable security definer set search_path = '' as $$
  select k.user_id, k.public_key
  from auth.users u
  join public.user_keys k on k.user_id = u.id
  where auth.uid() is not null
    and private.vault_mfa_satisfied()
    and lower(u.email) = lower(trim(p_email))
    and u.id <> auth.uid()
  limit 1
$$;
revoke all on function public.find_share_recipient(text) from public, anon;
grant execute on function public.find_share_recipient(text) to authenticated;

-- Marks an upload as ready after checking the stored object size matches the declared size.
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
revoke all on function public.finalize_vault_file(uuid) from public, anon;
grant execute on function public.finalize_vault_file(uuid) to authenticated;

-- Atomically consumes one download of a transfer. Service role only (Edge Function).
create or replace function public.claim_transfer_download(p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  t public.transfers;
  path text;
begin
  select * into t from public.transfers where id = p_id for update;
  if not found or t.revoked or t.expires_at <= now() or t.download_count >= t.max_downloads then
    return null;
  end if;
  select storage_path into path from public.vault_files where id = t.file_id and status = 'ready';
  if path is null then
    return null;
  end if;
  update public.transfers set download_count = download_count + 1 where id = p_id;
  return path;
end;
$$;
revoke all on function public.claim_transfer_download(uuid) from public, anon, authenticated;
grant execute on function public.claim_transfer_download(uuid) to service_role;

-- ------------------------------------------------------------------ storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vault-files', 'vault-files', false, 27262976, array['application/octet-stream'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists vault_files_object_insert on storage.objects;
create policy vault_files_object_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'vault-files'
  and (select private.vault_mfa_satisfied())
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.vault_files f
    where f.storage_path = objects.name and f.owner_id = (select auth.uid()) and f.status = 'pending'
  )
);

drop policy if exists vault_files_object_select on storage.objects;
create policy vault_files_object_select on storage.objects for select to authenticated using (
  bucket_id = 'vault-files'
  and (select private.vault_mfa_satisfied())
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (
      select 1 from public.vault_files f
      join public.file_shares s on s.file_id = f.id
      where f.storage_path = objects.name and s.recipient_id = (select auth.uid())
    )
  )
);

drop policy if exists vault_files_object_delete on storage.objects;
create policy vault_files_object_delete on storage.objects for delete to authenticated using (
  bucket_id = 'vault-files'
  and (select private.vault_mfa_satisfied())
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
