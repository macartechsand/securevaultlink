import type { VaultProfile } from '../lib/crypto';
import { supabase } from '../lib/supabase';

/** Raw (encrypted) rows as stored on the server. The server never sees plaintext. */
export type EntryRow = {
  id: string;
  ciphertext: string;
  iv: string;
  version: number;
  created_at: string;
  updated_at: string;
};

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

export async function fetchEntries(): Promise<EntryRow[]> {
  const { data, error } = await supabase
    .from('vault_entries')
    .select('id, ciphertext, iv, version, created_at, updated_at')
    .order('created_at', { ascending: false })
    .returns<EntryRow[]>();
  if (error) fail('Falha ao carregar as credenciais', error);
  return data ?? [];
}

export async function insertEntry(
  id: string,
  blob: { ciphertext: string; iv: string; version: number },
): Promise<void> {
  const { error } = await supabase.from('vault_entries').insert({ id, ...blob });
  if (error) fail('Falha ao salvar a credencial', error);
}

export async function updateEntry(
  id: string,
  blob: { ciphertext: string; iv: string; version: number },
): Promise<void> {
  const { data, error } = await supabase.from('vault_entries').update(blob).eq('id', id).select('id');
  if (error) fail('Falha ao atualizar a credencial', error);
  if (!data || data.length === 0) fail('Falha ao atualizar a credencial', { message: 'credencial não encontrada' });
}

export async function deleteEntry(id: string): Promise<void> {
  const { error } = await supabase.from('vault_entries').delete().eq('id', id);
  if (error) fail('Falha ao excluir a credencial', error);
}
