-- Phase C: Secured Items (types, custom fields, attachments, folders, tags, history, item sharing).
-- Item contents stay inside the encrypted blob. The server only stores ciphertext and wrapped keys.
-- Requires 20261018000100_plans_audit_expiry.sql.

-- ------------------------------------------------------------------ entries: per-item key + history
alter table public.vault_entries add column if not exists wrapped_key text check (length(wrapped_key) <= 512);
alter table public.vault_entries add column if not exists history_ciphertext text check (length(history_ciphertext) <= 65536);
grant update (wrapped_key, history_ciphertext) on public.vault_entries to authenticated;

create or replace function private.owns_entry(p_item uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.vault_entries e where e.id = p_item and e.user_id = auth.uid())
$$;

-- ------------------------------------------------------------------ folders
create table if not exists public.vault_folders (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name_ciphertext text not null check (length(name_ciphertext) <= 512),
  created_at timestamptz not null default now()
);
create index if not exists vault_folders_user_idx on public.vault_folders (user_id);
alter table public.vault_folders enable row level security;
alter table public.vault_folders force row level security;
revoke all on public.vault_folders from anon, authenticated, public;
grant select, insert, delete on public.vault_folders to authenticated;
grant update (name_ciphertext) on public.vault_folders to authenticated;
drop policy if exists vault_folders_own on public.vault_folders;
create policy vault_folders_own on public.vault_folders for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ------------------------------------------------------------------ item shares
create table if not exists public.item_shares (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.vault_entries (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  owner_email text,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  recipient_email text,
  permission text not null default 'view' check (permission in ('view', 'edit')),
  sealed_key text not null check (length(sealed_key) <= 512),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (item_id, recipient_id),
  check (recipient_id <> owner_id)
);
create index if not exists item_shares_recipient_idx on public.item_shares (recipient_id);
alter table public.item_shares enable row level security;
alter table public.item_shares force row level security;
revoke all on public.item_shares from anon, authenticated, public;
grant select, insert, delete on public.item_shares to authenticated;
grant update (sealed_key, permission) on public.item_shares to authenticated;

create or replace function private.is_item_recipient(p_item uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.item_shares s
    where s.item_id = p_item and s.recipient_id = auth.uid() and (s.expires_at is null or s.expires_at > now())
  )
$$;

create or replace function private.can_edit_item(p_item uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.item_shares s
    where s.item_id = p_item and s.recipient_id = auth.uid() and s.permission = 'edit'
      and (s.expires_at is null or s.expires_at > now())
  )
$$;

-- Reuse the generic triggers from the file vault (they read owner_id / recipient_id / expires_at).
drop trigger if exists item_shares_emails on public.item_shares;
create trigger item_shares_emails before insert on public.item_shares
  for each row execute function private.fill_share_owner_email();
drop trigger if exists item_shares_expiry on public.item_shares;
create trigger item_shares_expiry before insert on public.item_shares
  for each row execute function private.enforce_share_expiry();

drop policy if exists item_shares_select on public.item_shares;
create policy item_shares_select on public.item_shares for select to authenticated using (
  (select auth.uid()) = owner_id
  or ((select auth.uid()) = recipient_id and (expires_at is null or expires_at > now()))
);
drop policy if exists item_shares_insert on public.item_shares;
create policy item_shares_insert on public.item_shares for insert to authenticated with check (
  (select auth.uid()) = owner_id and private.owns_entry(item_id)
);
drop policy if exists item_shares_update on public.item_shares;
create policy item_shares_update on public.item_shares for update to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists item_shares_delete on public.item_shares;
create policy item_shares_delete on public.item_shares for delete to authenticated
  using ((select auth.uid()) in (owner_id, recipient_id));

-- Only v2 entries (per-item key) can be shared.
create or replace function private.require_v2_entry() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.vault_entries e where e.id = new.item_id and e.version = 2 and e.wrapped_key is not null
  ) then
    raise exception 'Item must be upgraded before sharing';
  end if;
  return new;
end;
$$;
drop trigger if exists item_shares_v2 on public.item_shares;
create trigger item_shares_v2 before insert on public.item_shares
  for each row execute function private.require_v2_entry();

-- ------------------------------------------------------------------ entries: recipient access
drop policy if exists vault_entries_select_shared on public.vault_entries;
create policy vault_entries_select_shared on public.vault_entries for select to authenticated
  using (private.is_item_recipient(id));

drop policy if exists vault_entries_update_shared on public.vault_entries;
create policy vault_entries_update_shared on public.vault_entries for update to authenticated
  using (private.can_edit_item(id)) with check (private.can_edit_item(id));

-- Recipients with "edit" may only replace the encrypted content, never the owner's key or history.
create or replace function private.guard_shared_entry_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and auth.uid() <> old.user_id then
    if new.wrapped_key is distinct from old.wrapped_key
       or new.history_ciphertext is distinct from old.history_ciphertext
       or new.version <> 2 or old.version <> 2 then
      raise exception 'Recipients can only edit the item content';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists vault_entries_guard_shared on public.vault_entries;
create trigger vault_entries_guard_shared before update on public.vault_entries
  for each row execute function private.guard_shared_entry_update();

-- Recipient public keys for the owner's own item shares (used to re-seal after a key rotation).
create or replace function public.item_share_recipient_keys(p_item uuid)
returns table (share_id uuid, recipient_id uuid, public_key text)
language sql stable security definer set search_path = '' as $$
  select s.id, s.recipient_id, k.public_key
  from public.item_shares s
  join public.user_keys k on k.user_id = s.recipient_id
  where s.item_id = p_item and s.owner_id = auth.uid() and private.vault_mfa_satisfied()
$$;
revoke all on function public.item_share_recipient_keys(uuid) from public, anon;
grant execute on function public.item_share_recipient_keys(uuid) to authenticated;

revoke all on function private.owns_entry(uuid), private.is_item_recipient(uuid), private.can_edit_item(uuid) from public, anon;
grant execute on function private.owns_entry(uuid), private.is_item_recipient(uuid), private.can_edit_item(uuid) to authenticated;

-- ------------------------------------------------------------------ MFA on the new tables
do $$
declare t text;
begin
  foreach t in array array['vault_folders', 'item_shares'] loop
    execute format('drop policy if exists %I on public.%I', t || '_require_mfa', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated
         using ((select private.vault_mfa_satisfied())) with check ((select private.vault_mfa_satisfied()))',
      t || '_require_mfa', t);
  end loop;
end $$;

-- ------------------------------------------------------------------ audit
create or replace function private.audit_item_shares() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform private.audit(new.owner_id, 'item.shared', 'entry', new.item_id::text,
      jsonb_build_object('recipient', new.recipient_email, 'permission', new.permission, 'expires_at', new.expires_at));
    perform private.audit(new.recipient_id, 'item.received', 'entry', new.item_id::text,
      jsonb_build_object('from', new.owner_email, 'permission', new.permission, 'expires_at', new.expires_at));
  elsif tg_op = 'UPDATE' then
    if new.permission is distinct from old.permission then
      perform private.audit(new.owner_id, 'item.share_permission_changed', 'entry', new.item_id::text,
        jsonb_build_object('recipient', new.recipient_email, 'permission', new.permission));
    end if;
  else
    perform private.audit(old.owner_id, 'item.share_removed', 'entry', old.item_id::text,
      jsonb_build_object('recipient', old.recipient_email));
  end if;
  return null;
end;
$$;
drop trigger if exists item_shares_audit on public.item_shares;
create trigger item_shares_audit after insert or update or delete on public.item_shares
  for each row execute function private.audit_item_shares();

-- Expired item shares are removed by cleanup-files as well (see the Edge Function).
