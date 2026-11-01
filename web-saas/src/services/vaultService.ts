import type { VaultProfile } from '../lib/crypto';
import { supabase } from '../lib/supabase';

/** Raw (encrypted) rows as stored on the server. The server never sees plaintext. */
export type EntryRow = {
  id: string;
  user_id: string;
  ciphertext: string;
  iv: string;
  version: number;
  wrapped_key: string | null;
  created_at: string;
  updated_at: string;
};

export type EntryBlob = { ciphertext: string; iv: string; version: number };

/** Raised when an item changed elsewhere since it was loaded (optimistic concurrency). */
export class EntryConflictError extends Error {}

type ProfileRow = {
  version: number;
  kdf: VaultProfile['kdf'];
  wrapped_dek_password: string;
  wrapped_dek_recovery?: string | null;
};

export class VaultServiceError extends Error {}

function fail(action: string, error: { message: string } | null): never {
  // Deliberately generic: never include payloads, and surface the failure to the caller.
  throw new VaultServiceError(`${action}${error ? `: ${error.message}` : ''}`);
}

const toRow = (profile: VaultProfile): ProfileRow => ({
  version: profile.version,
  kdf: profile.kdf,
  wrapped_dek_password: profile.wrappedDekPassword,
  wrapped_dek_recovery: profile.wrappedDekRecovery ?? null,
});

export async function fetchProfile(): Promise<VaultProfile | null> {
  const { data, error } = await supabase
    .from('vault_profiles')
    .select('version, kdf, wrapped_dek_password, wrapped_dek_recovery')
    .maybeSingle<ProfileRow>();
  if (error) fail('Falha ao carregar o cofre', error);
  if (!data) return null;
  return {
    version: data.version,
    kdf: data.kdf,
    wrappedDekPassword: data.wrapped_dek_password,
    wrappedDekRecovery: data.wrapped_dek_recovery ?? null,
  };
}

export async function createProfile(profile: VaultProfile): Promise<void> {
  const { error } = await supabase.from('vault_profiles').insert(toRow(profile));
  if (error) fail('Falha ao criar o cofre', error);
}

export async function updateProfile(userId: string, profile: VaultProfile): Promise<void> {
  const { error } = await supabase.from('vault_profiles').update(toRow(profile)).eq('user_id', userId);
  if (error) fail('Falha ao atualizar o cofre', error);
}

/** Own entries plus entries shared with the caller (RLS decides which rows are visible). */
export async function fetchEntries(): Promise<EntryRow[]> {
  const { data, error } = await supabase
    .from('vault_entries')
    .select('id, user_id, ciphertext, iv, version, wrapped_key, created_at, updated_at')
    .order('created_at', { ascending: false })
    .returns<EntryRow[]>();
  if (error) fail('Falha ao carregar as credenciais', error);
  return data ?? [];
}

export async function insertEntry(id: string, blob: EntryBlob, wrappedKey: string | null): Promise<EntryRow> {
  const { data, error } = await supabase
    .from('vault_entries')
    .insert({ id, ...blob, wrapped_key: wrappedKey })
    .select('id, user_id, ciphertext, iv, version, wrapped_key, created_at, updated_at')
    .single<EntryRow>();
  if (error || !data) fail('Falha ao salvar a credencial', error);
  return data!;
}

/**
 * Updates an entry only if it has not changed since `expectedUpdatedAt`. Owner-only extras
 * (`wrapped_key`, `history_ciphertext`) are rejected by the server for recipients.
 */
export async function updateEntry(
  id: string,
  blob: EntryBlob,
  expectedUpdatedAt: string,
  ownerExtras: { wrapped_key?: string; history_ciphertext?: string } = {},
): Promise<EntryRow> {
  const { data, error } = await supabase
    .from('vault_entries')
    .update({ ...blob, ...ownerExtras })
    .eq('id', id)
    .eq('updated_at', expectedUpdatedAt)
    .select('id, user_id, ciphertext, iv, version, wrapped_key, created_at, updated_at');
  if (error) fail('Falha ao atualizar a credencial', error);
  if (!data || data.length === 0) {
    throw new EntryConflictError('Este item foi alterado em outro lugar ou você não tem mais acesso. Recarregue e tente de novo.');
  }
  return data[0] as EntryRow;
}

export async function fetchEntryHistory(id: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('vault_entries')
    .select('history_ciphertext')
    .eq('id', id)
    .single<{ history_ciphertext: string | null }>();
  if (error) fail('Falha ao carregar o histórico', error);
  return data?.history_ciphertext ?? null;
}

export async function deleteEntry(id: string): Promise<void> {
  const { error } = await supabase.from('vault_entries').delete().eq('id', id);
  if (error) fail('Falha ao excluir a credencial', error);
}

/* ------------------------------------------------------------------ folders */

export type FolderRow = { id: string; name_ciphertext: string; created_at: string };

export async function fetchFolders(): Promise<FolderRow[]> {
  const { data, error } = await supabase
    .from('vault_folders')
    .select('id, name_ciphertext, created_at')
    .order('created_at')
    .returns<FolderRow[]>();
  if (error) fail('Falha ao carregar as pastas', error);
  return data ?? [];
}

export async function insertFolder(id: string, nameCiphertext: string) {
  const { error } = await supabase.from('vault_folders').insert({ id, name_ciphertext: nameCiphertext });
  if (error) fail('Falha ao criar a pasta', error);
}

export async function renameFolder(id: string, nameCiphertext: string) {
  const { error } = await supabase.from('vault_folders').update({ name_ciphertext: nameCiphertext }).eq('id', id);
  if (error) fail('Falha ao renomear a pasta', error);
}

export async function deleteFolder(id: string) {
  const { error } = await supabase.from('vault_folders').delete().eq('id', id);
  if (error) fail('Falha ao excluir a pasta', error);
}

/* ------------------------------------------------------------------ item shares */

export type ItemShareRow = {
  id: string;
  item_id: string;
  owner_id: string;
  owner_email: string | null;
  recipient_id: string;
  recipient_email: string | null;
  permission: 'view' | 'edit';
  sealed_key: string;
  expires_at: string | null;
  created_at: string;
};

const SHARE_COLUMNS = 'id, item_id, owner_id, owner_email, recipient_id, recipient_email, permission, sealed_key, expires_at, created_at';

/** Shares visible to the caller: the ones they own and the active ones they received. */
export async function fetchItemShares(): Promise<ItemShareRow[]> {
  const { data, error } = await supabase.from('item_shares').select(SHARE_COLUMNS).returns<ItemShareRow[]>();
  if (error) fail('Falha ao carregar os compartilhamentos', error);
  return data ?? [];
}

export async function insertItemShare(share: {
  item_id: string;
  recipient_id: string;
  permission: 'view' | 'edit';
  sealed_key: string;
  expires_at: string | null;
}) {
  const { error } = await supabase.from('item_shares').insert(share);
  if (error) {
    if (error.code === '23505') throw new Error('Este item já está compartilhado com essa pessoa.');
    fail('Falha ao compartilhar o item', error);
  }
}

export async function updateItemShare(id: string, changes: { permission?: 'view' | 'edit'; sealed_key?: string }) {
  const { error } = await supabase.from('item_shares').update(changes).eq('id', id);
  if (error) fail('Falha ao atualizar o compartilhamento', error);
}

export async function deleteItemShare(id: string) {
  const { error } = await supabase.from('item_shares').delete().eq('id', id);
  if (error) fail('Falha ao remover o compartilhamento', error);
}

export async function fetchShareRecipientKeys(itemId: string): Promise<{ share_id: string; recipient_id: string; public_key: string }[]> {
  const { data, error } = await supabase.rpc('item_share_recipient_keys', { p_item: itemId });
  if (error) fail('Falha ao carregar as chaves dos destinatários', error);
  return (data ?? []) as { share_id: string; recipient_id: string; public_key: string }[];
}
