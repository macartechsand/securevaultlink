/**
 * Per-item keys for Secured Items (entry format v2).
 *
 *  item key (random 256-bit) encrypts the item blob (AES-256-GCM, AAD = owner + item + version)
 *  item key wrapped by the owner's vault DEK  -> vault_entries.wrapped_key
 *  item key sealed to each recipient (ECDH)   -> item_shares.sealed_key
 *  password history: encrypted with the owner's DEK only (recipients never see old passwords)
 *  folder names: encrypted with the owner's DEK
 *
 * v1 entries (encrypted directly with the DEK) stay readable and are upgraded on the next save.
 */
import { fromBase64, toBase64 } from './encoding'
import { openSealedKey, sealKeyForRecipient } from './fileCrypto'
import { VaultCryptoError } from './vaultCrypto'

export const ITEM_ENTRY_VERSION = 2

const subtle = () => globalThis.crypto.subtle
const encoder = new TextEncoder()
const decoder = new TextDecoder()
const randomBytes = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n))

function concat(a: Uint8Array, b: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(a.length + b.length)
  out.set(a)
  out.set(b, a.length)
  return out
}

const importAes = (raw: Uint8Array<ArrayBuffer>) =>
  subtle().importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])

async function seal(key: CryptoKey, plaintext: Uint8Array<ArrayBuffer>, aad: Uint8Array<ArrayBuffer>) {
  const iv = randomBytes(12)
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: aad }, key, plaintext))
  return toBase64(concat(iv, ct))
}

async function open(key: CryptoKey, sealed: string, aad: Uint8Array<ArrayBuffer>, what: string) {
  try {
    const data = fromBase64(sealed)
    return new Uint8Array(
      await subtle().decrypt({ name: 'AES-GCM', iv: data.slice(0, 12), additionalData: aad }, key, data.slice(12)),
    )
  } catch {
    throw new VaultCryptoError(`${what} could not be decrypted (wrong key, corrupted or tampered)`)
  }
}

export function generateItemKey(): Uint8Array<ArrayBuffer> {
  return randomBytes(32)
}

const ownerAad = (ownerId: string, itemId: string) => encoder.encode(`securevault:item-key:owner:v1:${ownerId}:${itemId}`)
const shareInfo = (itemId: string, recipientId: string) => encoder.encode(`securevault:item-share:v1:${itemId}:${recipientId}`)
const entryAad = (ownerId: string, itemId: string, version: number) =>
  encoder.encode(`securevault:entry:v${version}:${ownerId}:${itemId}`)
const historyAad = (ownerId: string, itemId: string) => encoder.encode(`securevault:item-history:v1:${ownerId}:${itemId}`)
const folderAad = (ownerId: string, folderId: string) => encoder.encode(`securevault:folder:v1:${ownerId}:${folderId}`)

export function wrapItemKeyForOwner(dek: CryptoKey, ownerId: string, itemId: string, itemKey: Uint8Array<ArrayBuffer>) {
  return seal(dek, itemKey, ownerAad(ownerId, itemId))
}

export function unwrapItemKeyForOwner(dek: CryptoKey, ownerId: string, itemId: string, wrapped: string) {
  return open(dek, wrapped, ownerAad(ownerId, itemId), 'Item key')
}

export function sealItemKeyForRecipient(recipientPublicKey: string, itemKey: Uint8Array<ArrayBuffer>, itemId: string, recipientId: string) {
  return sealKeyForRecipient(recipientPublicKey, itemKey, shareInfo(itemId, recipientId))
}

export function openSealedItemKey(privateKey: CryptoKey, ownPublicKey: string, sealed: string, itemId: string, recipientId: string) {
  return openSealedKey(privateKey, ownPublicKey, sealed, shareInfo(itemId, recipientId), 'Shared item key')
}

/** Encrypts an item blob with its item key. The owner id is part of the AAD, also for edits made by recipients. */
export async function encryptItem(itemKey: Uint8Array<ArrayBuffer>, ownerId: string, itemId: string, data: unknown) {
  const iv = randomBytes(12)
  const ct = await subtle().encrypt(
    { name: 'AES-GCM', iv, additionalData: entryAad(ownerId, itemId, ITEM_ENTRY_VERSION) },
    await importAes(itemKey),
    encoder.encode(JSON.stringify(data)),
  )
  return { ciphertext: toBase64(new Uint8Array(ct)), iv: toBase64(iv), version: ITEM_ENTRY_VERSION }
}

export async function decryptItem<T = unknown>(
  itemKey: Uint8Array<ArrayBuffer>,
  ownerId: string,
  itemId: string,
  row: { ciphertext: string; iv: string; version: number },
): Promise<T> {
  if (row.version !== ITEM_ENTRY_VERSION) throw new VaultCryptoError('Unsupported item version')
  try {
    const pt = await subtle().decrypt(
      { name: 'AES-GCM', iv: fromBase64(row.iv), additionalData: entryAad(ownerId, itemId, row.version) },
      await importAes(itemKey),
      fromBase64(row.ciphertext),
    )
    return JSON.parse(decoder.decode(pt)) as T
  } catch {
    throw new VaultCryptoError('Entry could not be decrypted (corrupted or tampered)')
  }
}

export type PasswordHistoryEntry = { password: string; changedAt: string }

export function encryptHistory(dek: CryptoKey, ownerId: string, itemId: string, history: PasswordHistoryEntry[]) {
  return seal(dek, encoder.encode(JSON.stringify(history)), historyAad(ownerId, itemId))
}

export async function decryptHistory(dek: CryptoKey, ownerId: string, itemId: string, sealed: string): Promise<PasswordHistoryEntry[]> {
  return JSON.parse(decoder.decode(await open(dek, sealed, historyAad(ownerId, itemId), 'Password history')))
}

export function encryptFolderName(dek: CryptoKey, ownerId: string, folderId: string, name: string) {
  return seal(dek, encoder.encode(name), folderAad(ownerId, folderId))
}

export async function decryptFolderName(dek: CryptoKey, ownerId: string, folderId: string, sealed: string) {
  return decoder.decode(await open(dek, sealed, folderAad(ownerId, folderId), 'Folder name'))
}
