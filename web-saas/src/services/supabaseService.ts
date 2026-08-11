import type { SecureLink, VaultItem } from '../data/mockData';
import { supabase } from '../lib/supabase';
import {
  loadLocalSecureLinks,
  loadLocalVaultItems,
  saveLocalSecureLinks,
  saveLocalVaultItems,
} from './localPersistence';

export type VaultItemRow = VaultItem & {
  user_id: string;
  password: string;
};

export type SecureLinkRow = SecureLink & {
  user_id: string;
};

export async function signUp(email: string, password: string) {
  return supabase.auth.signUp({ email, password });
}

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function getSession() {
  return supabase.auth.getSession();
}

export function onAuthStateChange(callback: (event: string, session: any) => void) {
  return supabase.auth.onAuthStateChange(callback);
}

export async function fetchVaultItems(userId: string) {
  const response = await supabase
    .from('vault_items')
    .select('*')
    .eq('user_id', userId)
    .order('id', { ascending: false });

  if (response.error) {
    console.warn('Supabase fetchVaultItems failed. Falling back to local storage.', response.error);
    return { data: loadLocalVaultItems(userId), error: null };
  }

  if (response.data) {
    saveLocalVaultItems(userId, response.data as VaultItemRow[]);
  }

  return response;
}

export async function fetchSecureLinks(userId: string) {
  const response = await supabase
    .from('secure_links')
    .select('*')
    .eq('user_id', userId)
    .order('id', { ascending: false });

  if (response.error) {
    console.warn('Supabase fetchSecureLinks failed. Falling back to local storage.', response.error);
    return { data: loadLocalSecureLinks(userId), error: null };
  }

  if (response.data) {
    saveLocalSecureLinks(userId, response.data as SecureLinkRow[]);
  }

  return response;
}

export async function createVaultItem(item: Omit<VaultItemRow, 'id'>) {
  const response = await supabase.from('vault_items').insert(item).select().single();

  if (response.error) {
    console.warn('Supabase createVaultItem failed. Saving locally instead.', response.error);
    const localItem = {
      ...item,
      id: Date.now(),
    } as VaultItemRow;
    const existing = loadLocalVaultItems(item.user_id);
    saveLocalVaultItems(item.user_id, [localItem, ...existing]);
    return { data: localItem, error: null };
  }

  if (response.data) {
    const existing = loadLocalVaultItems(item.user_id);
    saveLocalVaultItems(item.user_id, [response.data as VaultItemRow, ...existing]);
  }

  return response;
}

export async function createSecureLink(link: Omit<SecureLinkRow, 'id'>) {
  const response = await supabase.from('secure_links').insert(link).select().single();

  if (response.error) {
    console.warn('Supabase createSecureLink failed. Saving locally instead.', response.error);
    const localLink = {
      ...link,
      id: Date.now(),
    } as SecureLinkRow;
    const existing = loadLocalSecureLinks(link.user_id);
    saveLocalSecureLinks(link.user_id, [localLink, ...existing]);
    return { data: localLink, error: null };
  }

  if (response.data) {
    const existing = loadLocalSecureLinks(link.user_id);
    saveLocalSecureLinks(link.user_id, [response.data as SecureLinkRow, ...existing]);
  }

  return response;
}
