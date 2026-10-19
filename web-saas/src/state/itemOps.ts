/**
 * Secured Item operations: decrypt/encrypt entries (v1 legacy and v2 per-item key), owner-only
 * password history, folders and item sharing with view/edit permissions and key rotation on revoke.
 * Item keys never leave memory; callers keep them in a Map that is dropped on lock.
 */
import {
  decryptEntry,
  decryptFolderName,
  decryptHistory,
  decryptItem,
  encryptFolderName,
  encryptHistory,
  encryptItem,
  generateItemKey,
  openSealedItemKey,
  type PasswordHistoryEntry,
  sealItemKeyForRecipient,
  unwrapItemKeyForOwner,
  wrapItemKeyForOwner,
} from '../lib/crypto';
import { LIMITS, type SecuredItemData, normalizeItem } from '../lib/items';
import type { KeyContext, UserKeyPair } from '../services/fileService';
import { shareAttachments, unshareAttachments } from '../services/fileService';
import * as vault from '../services/vaultService';

export type ItemAccess = 'owner' | 'view' | 'edit';

export type ItemShareInfo = {
  id: string;
  recipientId: string;
  recipientEmail: string;
  permission: 'view' | 'edit';
  expiresAt: string | null;
};

export type VaultItem = {
  id: string;
  ownerId: string;
  version: number;
  data: SecuredItemData;
  createdAt: string;
  updatedAt: string;
  access: ItemAccess;
  /** For items shared with me. */
  ownerEmail?: string;
  shareId?: string;
  shareExpiresAt?: string | null;
  /** For my items: who I shared them with. */
  sharedWith: ItemShareInfo[];
};

export type Folder = { id: string; name: string };

export type ItemKeys = Map<string, Uint8Array<ArrayBuffer>>;

/** Loads every visible entry and the caller's shares. Item keys are stored into `keys`. */
export async function loadItems(
  ctx: KeyContext,
  keyPair: UserKeyPair | null,
  keys: ItemKeys,
): Promise<{ items: VaultItem[]; failed: number }> {
  const [rows, shares] = await Promise.all([vault.fetchEntries(), vault.fetchItemShares().catch(() => [] as vault.ItemShareRow[])]);
  const items: VaultItem[] = [];
  let failed = 0;
  for (const row of rows) {
    try {
      const owned = row.user_id === ctx.userId;
      let raw: unknown;
      let access: ItemAccess = 'owner';
      let received: vault.ItemShareRow | undefined;
      if (owned && row.version === 1) {
        raw = await decryptEntry(ctx.dek, ctx.userId, row.id, row);
      } else if (owned) {
        if (!row.wrapped_key) throw new Error('missing item key');
        const key = await unwrapItemKeyForOwner(ctx.dek, ctx.userId, row.id, row.wrapped_key);
        keys.set(row.id, key);
        raw = await decryptItem(key, row.user_id, row.id, row);
      } else {
        received = shares.find((s) => s.item_id === row.id && s.recipient_id === ctx.userId);
        if (!received || !keyPair) throw new Error('no share');
        const key = await openSealedItemKey(keyPair.privateKey, keyPair.publicKey, received.sealed_key, row.id, ctx.userId);
        keys.set(row.id, key);
        raw = await decryptItem(key, row.user_id, row.id, row);
        access = received.permission;
      }
      const data = normalizeItem(raw);
      // A recipient's folder ids belong to the owner; never apply them locally.
      if (!owned) data.folderId = null;
      items.push({
        id: row.id,
        ownerId: row.user_id,
        version: row.version,
        data,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        access,
        ownerEmail: received?.owner_email ?? undefined,
        shareId: received?.id,
        shareExpiresAt: received?.expires_at ?? null,
        sharedWith: owned
          ? shares
              .filter((s) => s.item_id === row.id && s.owner_id === ctx.userId)
              .map((s) => ({
                id: s.id,
                recipientId: s.recipient_id,
                recipientEmail: s.recipient_email ?? s.recipient_id,
                permission: s.permission,
                expiresAt: s.expires_at,
              }))
          : [],
      });
    } catch {
      failed += 1;
    }
  }
  return { items, failed };
}

function toItem(row: vault.EntryRow, data: SecuredItemData, base?: VaultItem): VaultItem {
  return {
    ...(base ?? { access: 'owner' as const, sharedWith: [] }),
    id: row.id,
    ownerId: row.user_id,
    version: row.version,
    data,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  } as VaultItem;
}

export async function createItem(ctx: KeyContext, keys: ItemKeys, input: SecuredItemData): Promise<VaultItem> {
  const id = crypto.randomUUID();
  const key = generateItemKey();
  const data = { ...input, passwordUpdatedAt: input.password ? new Date().toISOString() : null };
  const blob = await encryptItem(key, ctx.userId, id, data);
  const row = await vault.insertEntry(id, blob, await wrapItemKeyForOwner(ctx.dek, ctx.userId, id, key));
  keys.set(id, key);
  return toItem(row, data);
}

/**
 * Saves changes. Owners upgrade v1 entries to v2 and get the previous password appended to the
 * owner-only history. Recipients with edit permission only replace the encrypted content.
 */
export async function saveItem(ctx: KeyContext, keys: ItemKeys, item: VaultItem, input: SecuredItemData): Promise<VaultItem> {
  if (item.access === 'view') throw new Error('Você só tem permissão de visualização neste item.');
  const passwordChanged = input.password !== item.data.password;
  const data: SecuredItemData = {
    ...input,
    folderId: item.access === 'owner' ? input.folderId : null,
    passwordUpdatedAt: passwordChanged ? new Date().toISOString() : item.data.passwordUpdatedAt,
  };

  if (item.access === 'edit') {
    const key = keys.get(item.id);
    if (!key) throw new Error('The vault is locked.');
    const row = await vault.updateEntry(item.id, await encryptItem(key, item.ownerId, item.id, data), item.updatedAt);
    return toItem(row, data, item);
  }

  let key = keys.get(item.id);
  const extras: { wrapped_key?: string; history_ciphertext?: string } = {};
  if (!key || item.version !== 2) {
    key = generateItemKey();
    extras.wrapped_key = await wrapItemKeyForOwner(ctx.dek, ctx.userId, item.id, key);
  }
  if (passwordChanged && item.data.password) {
    const history = await loadHistory(ctx, item.id);
    history.unshift({ password: item.data.password, changedAt: new Date().toISOString() });
    extras.history_ciphertext = await encryptHistory(ctx.dek, ctx.userId, item.id, history.slice(0, LIMITS.history));
  }
  const row = await vault.updateEntry(item.id, await encryptItem(key, ctx.userId, item.id, data), item.updatedAt, extras);
  keys.set(item.id, key);

  // New attachments on an already-shared item are shared with the current recipients too.
  const before = new Set(item.data.attachments.map((a) => a.fileId));
  const added = data.attachments.map((a) => a.fileId).filter((id) => !before.has(id));
  if (added.length && item.sharedWith.length) {
    for (const r of await vault.fetchShareRecipientKeys(item.id)) {
      const share = item.sharedWith.find((s) => s.id === r.share_id);
      await shareAttachments(ctx, added, { userId: r.recipient_id, publicKey: r.public_key }, share?.expiresAt ?? null);
    }
  }
  // Attachments removed from the item stop being shared.
  const after = new Set(data.attachments.map((a) => a.fileId));
  const removed = [...before].filter((id) => !after.has(id));
  for (const s of item.sharedWith) await unshareAttachments(removed, s.recipientId);

  return toItem(row, data, item);
}

export async function loadHistory(ctx: KeyContext, itemId: string): Promise<PasswordHistoryEntry[]> {
  const sealed = await vault.fetchEntryHistory(itemId);
  if (!sealed) return [];
  return decryptHistory(ctx.dek, ctx.userId, itemId, sealed);
}

/** Shares an item (upgrading v1 first) and its attachments with a recipient. */
export async function shareItem(
  ctx: KeyContext,
  keys: ItemKeys,
  item: VaultItem,
  recipient: { userId: string; publicKey: string },
  permission: 'view' | 'edit',
  expiresAt: string | null,
): Promise<VaultItem> {
  if (item.access !== 'owner') throw new Error('Só o dono pode compartilhar este item.');
  let current = item;
  if (item.version !== 2 || !keys.get(item.id)) current = await saveItem(ctx, keys, item, item.data);
  const key = keys.get(current.id)!;
  await vault.insertItemShare({
    item_id: current.id,
    recipient_id: recipient.userId,
    permission,
    sealed_key: await sealItemKeyForRecipient(recipient.publicKey, key, current.id, recipient.userId),
    expires_at: expiresAt,
  });
  await shareAttachments(ctx, current.data.attachments.map((a) => a.fileId), recipient, expiresAt);
  return current;
}

/**
 * Revokes a share and rotates the item key, so the removed person cannot read future versions even
 * if they kept the old key. Remaining recipients get the new key re-sealed.
 */
export async function revokeItemShare(ctx: KeyContext, keys: ItemKeys, item: VaultItem, share: ItemShareInfo): Promise<VaultItem> {
  await vault.deleteItemShare(share.id);
  await unshareAttachments(item.data.attachments.map((a) => a.fileId), share.recipientId);

  const newKey = generateItemKey();
  const row = await vault.updateEntry(item.id, await encryptItem(newKey, ctx.userId, item.id, item.data), item.updatedAt, {
    wrapped_key: await wrapItemKeyForOwner(ctx.dek, ctx.userId, item.id, newKey),
  });
  keys.set(item.id, newKey);
  for (const r of await vault.fetchShareRecipientKeys(item.id)) {
    await vault.updateItemShare(r.share_id, {
      sealed_key: await sealItemKeyForRecipient(r.public_key, newKey, item.id, r.recipient_id),
    });
  }
  return toItem(row, item.data, { ...item, sharedWith: item.sharedWith.filter((s) => s.id !== share.id) });
}

/* ------------------------------------------------------------------ folders */

export async function loadFolders(ctx: KeyContext): Promise<Folder[]> {
  const rows = await vault.fetchFolders();
  const folders: Folder[] = [];
  for (const row of rows) {
    try {
      folders.push({ id: row.id, name: await decryptFolderName(ctx.dek, ctx.userId, row.id, row.name_ciphertext) });
    } catch {
      /* skip undecryptable folder */
    }
  }
  return folders.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export async function createFolder(ctx: KeyContext, name: string): Promise<Folder> {
  const clean = name.trim().slice(0, 60);
  if (!clean) throw new Error('Informe o nome da pasta.');
  const id = crypto.randomUUID();
  await vault.insertFolder(id, await encryptFolderName(ctx.dek, ctx.userId, id, clean));
  return { id, name: clean };
}

export async function renameFolder(ctx: KeyContext, folder: Folder, name: string): Promise<Folder> {
  const clean = name.trim().slice(0, 60);
  if (!clean) throw new Error('Informe o nome da pasta.');
  await vault.renameFolder(folder.id, await encryptFolderName(ctx.dek, ctx.userId, folder.id, clean));
  return { ...folder, name: clean };
}
