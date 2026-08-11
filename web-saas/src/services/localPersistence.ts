import type { SecureLink, VaultItem } from '../data/mockData';

type VaultItemRow = VaultItem & {
  user_id: string;
  password: string;
};

type SecureLinkRow = SecureLink & {
  user_id: string;
};

const VAULT_STORAGE_KEY = 'securevault-vault-items';
const LINKS_STORAGE_KEY = 'securevault-secure-links';

function safeParse<T>(value: string | null): T | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function isBrowser() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function loadLocalVaultItems(userId: string): VaultItemRow[] {
  if (!isBrowser()) {
    return [];
  }

  const stored = safeParse<Record<string, VaultItemRow[]>>(window.localStorage.getItem(VAULT_STORAGE_KEY));
  return stored?.[userId] ?? [];
}

export function saveLocalVaultItems(userId: string, items: VaultItemRow[]) {
  if (!isBrowser()) {
    return;
  }

  const stored = safeParse<Record<string, VaultItemRow[]>>(window.localStorage.getItem(VAULT_STORAGE_KEY)) ?? {};
  stored[userId] = items;
  window.localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(stored));
}

export function loadLocalSecureLinks(userId: string): SecureLinkRow[] {
  if (!isBrowser()) {
    return [];
  }

  const stored = safeParse<Record<string, SecureLinkRow[]>>(window.localStorage.getItem(LINKS_STORAGE_KEY));
  return stored?.[userId] ?? [];
}

export function saveLocalSecureLinks(userId: string, links: SecureLinkRow[]) {
  if (!isBrowser()) {
    return;
  }

  const stored = safeParse<Record<string, SecureLinkRow[]>>(window.localStorage.getItem(LINKS_STORAGE_KEY)) ?? {};
  stored[userId] = links;
  window.localStorage.setItem(LINKS_STORAGE_KEY, JSON.stringify(stored));
}
