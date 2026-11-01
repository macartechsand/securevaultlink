-- SecureVault MVP: end-to-end encrypted vault schema.
-- Additive only: does not touch the legacy plaintext tables (vault_items, secure_links).
-- The server only stores ciphertext, IVs and wrapped keys (see web-saas/src/lib/crypto).

create table if not exists public.vault_profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  version integer not null default 1,
  kdf jsonb not null,
  wrapped_dek_password text not null,
  wrapped_dek_recovery text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vault_profiles_sizes check (
    length(wrapped_dek_password) <= 512 and length(wrapped_dek_recovery) <= 512
  )
);

create table if not exists public.vault_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  ciphertext text not null,
  iv text not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vault_entries_sizes check (length(ciphertext) <= 131072 and length(iv) <= 64)
);

create index if not exists vault_entries_user_id_idx on public.vault_entries (user_id);

create or replace function public.touch_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists vault_profiles_touch on public.vault_profiles;
create trigger vault_profiles_touch before update on public.vault_profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists vault_entries_touch on public.vault_entries;
create trigger vault_entries_touch before update on public.vault_entries
  for each row execute function public.touch_updated_at();

-- Row Level Security: each user can only see and change their own rows.
alter table public.vault_profiles enable row level security;
alter table public.vault_profiles force row level security;
alter table public.vault_entries enable row level security;
alter table public.vault_entries force row level security;

revoke all on public.vault_profiles from anon, public;
revoke all on public.vault_entries from anon, public;
grant select, insert, update on public.vault_profiles to authenticated;
grant select, insert, update, delete on public.vault_entries to authenticated;

drop policy if exists vault_profiles_select_own on public.vault_profiles;
create policy vault_profiles_select_own on public.vault_profiles
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists vault_profiles_insert_own on public.vault_profiles;
create policy vault_profiles_insert_own on public.vault_profiles
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists vault_profiles_update_own on public.vault_profiles;
create policy vault_profiles_update_own on public.vault_profiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists vault_entries_select_own on public.vault_entries;
create policy vault_entries_select_own on public.vault_entries
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists vault_entries_insert_own on public.vault_entries;
create policy vault_entries_insert_own on public.vault_entries
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists vault_entries_update_own on public.vault_entries;
create policy vault_entries_update_own on public.vault_entries
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists vault_entries_delete_own on public.vault_entries;
create policy vault_entries_delete_own on public.vault_entries
  for delete to authenticated using ((select auth.uid()) = user_id);
