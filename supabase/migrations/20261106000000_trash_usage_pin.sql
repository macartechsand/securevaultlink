-- 2026-11-06: Premium trash (14 days), encrypted "last used" records (Premium), PIN unlock with a
-- server-enforced attempt limit (all plans) and the client event for emergency mode.
--
-- Plan rules are enforced HERE, not only in the app: a Free account cannot move items to the trash
-- or record usage even with a modified client. Downgrading never locks data: restoring or deleting
-- items already in the trash is always allowed.
--
-- Zero-knowledge is preserved:
--  - usage records are encrypted on the device with the item key (where and when stay unreadable here);
--  - the PIN never reaches the server. The server keeps a random share needed to unwrap the vault key
--    on that device and releases it only for the right PIN verifier, at most 5 wrong tries.
-- Safe to re-run.

-- ------------------------------------------------------------------ plan helper
create or replace function private.is_premium(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.user_plan(p_user) = 'premium'
$$;
revoke all on function private.is_premium(uuid) from public, anon;
grant execute on function private.is_premium(uuid) to authenticated;

-- ------------------------------------------------------------------ trash
alter table public.vault_entries add column if not exists deleted_at timestamptz;
grant update (deleted_at) on public.vault_entries to authenticated;
create index if not exists vault_entries_trash_idx on public.vault_entries (deleted_at) where deleted_at is not null;

-- Only the owner moves items in and out of the trash; moving in needs Premium and the date is the
-- server's. Items in the trash cannot be edited by recipients (they no longer see them).
create or replace function private.guard_trash() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    return new; -- service role / scheduled purge
  end if;
  if new.deleted_at is distinct from old.deleted_at then
    if auth.uid() <> old.user_id then
      raise exception 'Only the owner can move an item to or from the trash';
    end if;
    if new.deleted_at is not null then
      if old.deleted_at is not null then
        new.deleted_at := old.deleted_at;
      elsif not private.is_premium(auth.uid()) then
        raise exception 'PREMIUM_REQUIRED: trash' using errcode = 'P0001';
      else
        new.deleted_at := now();
      end if;
    end if;
  elsif old.deleted_at is not null and auth.uid() <> old.user_id then
    raise exception 'Item is in the trash';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_trash() from public, anon, authenticated;
drop trigger if exists vault_entries_guard_trash on public.vault_entries;
create trigger vault_entries_guard_trash before update on public.vault_entries
  for each row execute function private.guard_trash();

-- Shared items in the owner's trash disappear for recipients. The condition is on the row itself
-- (not inside the helper functions) so the policies never query vault_entries recursively.
drop policy if exists vault_entries_select_shared on public.vault_entries;
create policy vault_entries_select_shared on public.vault_entries for select to authenticated
  using (deleted_at is null and private.is_item_recipient(id));

drop policy if exists vault_entries_update_shared on public.vault_entries;
create policy vault_entries_update_shared on public.vault_entries for update to authenticated
  using (deleted_at is null and private.can_edit_item(id)) with check (deleted_at is null and private.can_edit_item(id));

-- Audit: trash and restore get their own events.
create or replace function private.audit_vault_entries() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform private.audit(new.user_id, 'vault.entry_created', 'entry', new.id::text);
  elsif tg_op = 'UPDATE' then
    if new.deleted_at is not null and old.deleted_at is null then
      perform private.audit(new.user_id, 'vault.entry_trashed', 'entry', new.id::text);
    elsif new.deleted_at is null and old.deleted_at is not null then
      perform private.audit(new.user_id, 'vault.entry_restored', 'entry', new.id::text);
    else
      perform private.audit(new.user_id, 'vault.entry_updated', 'entry', new.id::text);
    end if;
  else
    perform private.audit(old.user_id, 'vault.entry_deleted', 'entry', old.id::text);
  end if;
  return null;
end;
$$;

-- Permanent removal 14 days after an item went to the trash.
create or replace function private.purge_trash() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  delete from public.vault_entries where deleted_at is not null and deleted_at < now() - interval '14 days';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function private.purge_trash() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('purge-trash-daily', '20 3 * * *', 'select private.purge_trash()');
  end if;
end;
$$;

-- ------------------------------------------------------------------ last used (encrypted)
create table if not exists public.item_usage (
  item_id uuid not null references public.vault_entries (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  ciphertext text not null check (length(ciphertext) <= 2048),
  iv text not null check (length(iv) <= 64),
  used_at timestamptz not null default now(),
  primary key (item_id, user_id)
);
alter table public.item_usage enable row level security;
alter table public.item_usage force row level security;
revoke all on public.item_usage from anon, public, authenticated;
grant select, delete on public.item_usage to authenticated;
grant insert (item_id, ciphertext, iv) on public.item_usage to authenticated;
grant update (ciphertext, iv) on public.item_usage to authenticated;

create or replace function private.usage_server_time() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.used_at := now();
  return new;
end;
$$;
drop trigger if exists item_usage_time on public.item_usage;
create trigger item_usage_time before insert or update on public.item_usage
  for each row execute function private.usage_server_time();

drop policy if exists item_usage_select_own on public.item_usage;
create policy item_usage_select_own on public.item_usage for select to authenticated
  using (user_id = (select auth.uid()) and private.vault_mfa_satisfied());

drop policy if exists item_usage_insert_premium on public.item_usage;
create policy item_usage_insert_premium on public.item_usage for insert to authenticated
  with check (user_id = (select auth.uid()) and private.vault_mfa_satisfied() and private.is_premium(auth.uid())
              and (private.owns_entry(item_id) or private.is_item_recipient(item_id)));

drop policy if exists item_usage_update_premium on public.item_usage;
create policy item_usage_update_premium on public.item_usage for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and private.vault_mfa_satisfied() and private.is_premium(auth.uid())
              and (private.owns_entry(item_id) or private.is_item_recipient(item_id)));

drop policy if exists item_usage_delete_own on public.item_usage;
create policy item_usage_delete_own on public.item_usage for delete to authenticated
  using (user_id = (select auth.uid()));

-- ------------------------------------------------------------------ PIN unlock
create table if not exists private.pin_unlock (
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id uuid not null,
  verifier_hash text not null,
  share text not null,
  attempts integer not null default 0 check (attempts between 0 and 5),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (user_id, device_id)
);
revoke all on private.pin_unlock from public, anon, authenticated;

-- Registers (or replaces) the PIN of one device. Returns the server share, valid for 14 days.
create or replace function public.pin_register(p_device uuid, p_verifier text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_share text;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if not private.vault_mfa_satisfied() then
    raise exception 'MFA required';
  end if;
  if p_device is null or p_verifier is null or length(p_verifier) <> 44 then
    raise exception 'Invalid PIN registration';
  end if;
  v_share := encode(extensions.gen_random_bytes(32), 'base64');
  insert into private.pin_unlock (user_id, device_id, verifier_hash, share, expires_at)
  values (auth.uid(), p_device, encode(extensions.digest(p_verifier, 'sha256'), 'hex'), v_share, now() + interval '14 days')
  on conflict (user_id, device_id) do update
    set verifier_hash = excluded.verifier_hash, share = excluded.share, attempts = 0,
        created_at = now(), expires_at = excluded.expires_at;
  delete from private.pin_unlock
  where user_id = auth.uid()
    and device_id in (select device_id from private.pin_unlock where user_id = auth.uid() order by created_at desc offset 10);
  perform private.audit(auth.uid(), 'pin.enabled', 'device', p_device::text);
  return v_share;
end;
$$;

-- Releases the share for the right verifier. Never raises on a wrong PIN, so the attempt counter
-- is committed; the 5th wrong try deletes the registration (the master password is needed again).
create or replace function public.pin_unlock(p_device uuid, p_verifier text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r private.pin_unlock%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if not private.vault_mfa_satisfied() then
    raise exception 'MFA required';
  end if;
  select * into r from private.pin_unlock where user_id = auth.uid() and device_id = p_device for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unavailable');
  end if;
  if r.expires_at <= now() then
    delete from private.pin_unlock where user_id = r.user_id and device_id = r.device_id;
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  if r.verifier_hash = encode(extensions.digest(coalesce(p_verifier, ''), 'sha256'), 'hex') then
    update private.pin_unlock set attempts = 0 where user_id = r.user_id and device_id = r.device_id;
    perform private.audit(auth.uid(), 'pin.unlocked', 'device', p_device::text);
    return jsonb_build_object('ok', true, 'share', r.share, 'expires_at', r.expires_at);
  end if;
  if r.attempts + 1 >= 5 then
    delete from private.pin_unlock where user_id = r.user_id and device_id = r.device_id;
    perform private.audit(auth.uid(), 'pin.locked_out', 'device', p_device::text);
    return jsonb_build_object('ok', false, 'reason', 'locked');
  end if;
  update private.pin_unlock set attempts = r.attempts + 1 where user_id = r.user_id and device_id = r.device_id;
  perform private.audit(auth.uid(), 'pin.failed', 'device', p_device::text);
  return jsonb_build_object('ok', false, 'reason', 'wrong', 'remaining', 5 - (r.attempts + 1));
end;
$$;

-- Removes the PIN of one device, or of every device (emergency mode, "forget all PINs").
create or replace function public.pin_remove(p_device uuid default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  delete from private.pin_unlock where user_id = auth.uid() and (p_device is null or device_id = p_device);
  get diagnostics n = row_count;
  if n > 0 then
    perform private.audit(auth.uid(), 'pin.removed', 'device', coalesce(p_device::text, 'all'));
  end if;
  return n;
end;
$$;

revoke all on function public.pin_register(uuid, text), public.pin_unlock(uuid, text), public.pin_remove(uuid) from public, anon;
grant execute on function public.pin_register(uuid, text), public.pin_unlock(uuid, text), public.pin_remove(uuid) to authenticated;

-- ------------------------------------------------------------------ client events
-- Same function as 20261104000000, plus the emergency mode event.
create or replace function public.log_client_event(p_event text, p_target_type text default null,
  p_target_id text default null, p_details jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if p_event not in ('vault.unlocked', 'vault.unlock_failed', 'vault.recovered', 'vault.locked',
                     'file.downloaded', 'file.shared_downloaded', 'mfa.enrolled', 'mfa.disabled',
                     'session.others_signed_out', 'client.error', 'item.filled', 'security.emergency_mode') then
    raise exception 'Unknown event';
  end if;
  if pg_column_size(coalesce(p_details, '{}'::jsonb)) > 1024 then
    raise exception 'Details too large';
  end if;
  insert into public.audit_events (user_id, actor_id, event, target_type, target_id, source, details)
  values (auth.uid(), auth.uid(), p_event, left(p_target_type, 32), left(p_target_id, 64), 'client',
          coalesce(p_details, '{}'::jsonb));
end;
$$;
revoke all on function public.log_client_event(text, text, text, jsonb) from public, anon;
grant execute on function public.log_client_event(text, text, text, jsonb) to authenticated;
