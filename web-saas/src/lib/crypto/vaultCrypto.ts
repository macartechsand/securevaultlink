/**
 * Client-side vault cryptography (zero-knowledge).
 *
 *  master password --PBKDF2-HMAC-SHA256--> KEK (wraps the DEK)
 *  recovery key (256-bit random)         -> recovery KEK (wraps the DEK)
 *  DEK (random AES-256-GCM key) encrypts every vault entry; the server only
 *  ever sees ciphertext, IVs and wrapped keys.
 *
 * Only WebCrypto primitives are used; no custom cryptography.
 */
import { fromBase32, fromBase64, toBase32, toBase64 } from './encoding'

export const KDF_ALGORITHM = 'PBKDF2-SHA256'
export const KDF_ITERATIONS = 600_000
/** Bounds enforced on server-supplied parameters (anti-downgrade / anti-DoS). */
export const KDF_MIN_ITERATIONS = 600_000
export const KDF_MAX_ITERATIONS = 5_000_000
export const PROFILE_VERSION = 1
export const ENTRY_VERSION = 1

export type VaultProfile = {
  version: number
  kdf: { algorithm: typeof KDF_ALGORITHM; iterations: number; salt: string }
  /** DEK wrapped by the master-password KEK (base64 iv||ciphertext). */
  wrappedDekPassword: string
  /** DEK wrapped by the recovery key (base64 iv||ciphertext). */
  wrappedDekRecovery: string
}

export type VaultItemData = {
  title: string
  username: string
  password: string
  url: string
  notes: string
  category: string
}

export class VaultCryptoError extends Error {}

const subtle = () => globalThis.crypto.subtle
const encoder = new TextEncoder()
const decoder = new TextDecoder()

const randomBytes = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n))
const WRAP_AAD_PASSWORD = encoder.encode('securevault:dek-wrap:password:v1')
const WRAP_AAD_RECOVERY = encoder.encode('securevault:dek-wrap:recovery:v1')

function assertKdf(kdf: VaultProfile['kdf']) {
  if (
    kdf.algorithm !== KDF_ALGORITHM ||
    !Number.isInteger(kdf.iterations) ||
    kdf.iterations < KDF_MIN_ITERATIONS ||
    kdf.iterations > KDF_MAX_ITERATIONS
  ) {
    throw new VaultCryptoError('Unsupported or unsafe key derivation parameters')
  }
}

async function deriveKek(password: string, kdf: VaultProfile['kdf']): Promise<CryptoKey> {
  assertKdf(kdf)
  const material = await subtle().importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveKey',
  ])
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(kdf.salt), iterations: kdf.iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function importRecoveryKek(recoveryKey: string): Promise<CryptoKey> {
  let raw: Uint8Array<ArrayBuffer>
  try {
    raw = fromBase32(recoveryKey)
  } catch {
    throw new VaultCryptoError('Invalid recovery key')
  }
  if (raw.length !== 32) throw new VaultCryptoError('Invalid recovery key')
  return subtle().importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ])
}

async function wrap(kek: CryptoKey, dekRaw: Uint8Array<ArrayBuffer>, aad: Uint8Array<ArrayBuffer>) {
  const iv = randomBytes(12)
  const ct = new Uint8Array(
    await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: aad }, kek, dekRaw),
  )
  const out = new Uint8Array(iv.length + ct.length)
  out.set(iv)
  out.set(ct, iv.length)
  return toBase64(out)
}

async function unwrap(
  kek: CryptoKey,
  wrapped: string,
  aad: Uint8Array<ArrayBuffer>,
  extractable: boolean,
): Promise<CryptoKey> {
  try {
    const data = fromBase64(wrapped)
    const raw = await subtle().decrypt(
      { name: 'AES-GCM', iv: data.slice(0, 12), additionalData: aad },
      kek,
      data.slice(12),
    )
    return await subtle().importKey('raw', raw, { name: 'AES-GCM', length: 256 }, extractable, [
      'encrypt',
      'decrypt',
    ])
  } catch {
    throw new VaultCryptoError('Wrong master password or recovery key')
  }
}

async function rawKey(key: CryptoKey) {
  return new Uint8Array(await subtle().exportKey('raw', key))
}

function newKdfParams() {
  return {
    algorithm: KDF_ALGORITHM,
    iterations: KDF_ITERATIONS,
    salt: toBase64(randomBytes(16)),
  } as const
}

/** Creates a brand-new vault. The recovery key is returned once and never stored. */
export async function createVault(masterPassword: string): Promise<{
  profile: VaultProfile
  recoveryKey: string
  dek: CryptoKey
}> {
  const kdf = newKdfParams()
  const dekRaw = randomBytes(32)
  const recoveryRaw = randomBytes(32)
  const kek = await deriveKek(masterPassword, kdf)
  const recoveryKek = await importRecoveryKek(toBase32(recoveryRaw))
  const profile: VaultProfile = {
    version: PROFILE_VERSION,
    kdf,
    wrappedDekPassword: await wrap(kek, dekRaw, WRAP_AAD_PASSWORD),
    wrappedDekRecovery: await wrap(recoveryKek, dekRaw, WRAP_AAD_RECOVERY),
  }
  const recoveryKey = toBase32(recoveryRaw).replace(/(.{4})(?=.)/g, '$1-')
  const dek = await subtle().importKey('raw', dekRaw, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ])
  dekRaw.fill(0)
  return { profile, recoveryKey, dek }
}

export async function unlockWithPassword(profile: VaultProfile, masterPassword: string) {
  const kek = await deriveKek(masterPassword, profile.kdf)
  return unwrap(kek, profile.wrappedDekPassword, WRAP_AAD_PASSWORD, false)
}

export async function unlockWithRecoveryKey(profile: VaultProfile, recoveryKey: string) {
  assertKdf(profile.kdf)
  const kek = await importRecoveryKek(recoveryKey)
  return unwrap(kek, profile.wrappedDekRecovery, WRAP_AAD_RECOVERY, false)
}

/** Re-wraps the DEK under a new master password (new salt). Entries stay valid. */
export async function changeMasterPassword(
  profile: VaultProfile,
  currentPassword: string,
  newPassword: string,
): Promise<VaultProfile> {
  const kek = await deriveKek(currentPassword, profile.kdf)
  const dek = await unwrap(kek, profile.wrappedDekPassword, WRAP_AAD_PASSWORD, true)
  return rewrapPassword(profile, dek, newPassword)
}

/** Sets a new master password using the recovery key. Entries stay valid. */
export async function resetPasswordWithRecoveryKey(
  profile: VaultProfile,
  recoveryKey: string,
  newPassword: string,
): Promise<VaultProfile> {
  assertKdf(profile.kdf)
  const kek = await importRecoveryKek(recoveryKey)
  const dek = await unwrap(kek, profile.wrappedDekRecovery, WRAP_AAD_RECOVERY, true)
  return rewrapPassword(profile, dek, newPassword)
}

async function rewrapPassword(
  profile: VaultProfile,
  dek: CryptoKey,
  newPassword: string,
): Promise<VaultProfile> {
  const kdf = newKdfParams()
  const kek = await deriveKek(newPassword, kdf)
  return {
    ...profile,
    kdf,
    wrappedDekPassword: await wrap(kek, await rawKey(dek), WRAP_AAD_PASSWORD),
  }
}

/** AAD binds a ciphertext to its owner and row, so blobs cannot be swapped between rows/users. */
const entryAad = (userId: string, entryId: string, version: number) =>
  encoder.encode(`securevault:entry:v${version}:${userId}:${entryId}`)

export async function encryptEntry(
  dek: CryptoKey,
  userId: string,
  entryId: string,
  data: VaultItemData,
): Promise<{ ciphertext: string; iv: string; version: number }> {
  const iv = randomBytes(12)
  const ct = await subtle().encrypt(
    { name: 'AES-GCM', iv, additionalData: entryAad(userId, entryId, ENTRY_VERSION) },
    dek,
    encoder.encode(JSON.stringify(data)),
  )
  return { ciphertext: toBase64(new Uint8Array(ct)), iv: toBase64(iv), version: ENTRY_VERSION }
}

export async function decryptEntry(
  dek: CryptoKey,
  userId: string,
  entryId: string,
  row: { ciphertext: string; iv: string; version: number },
): Promise<VaultItemData> {
  try {
    const pt = await subtle().decrypt(
      {
        name: 'AES-GCM',
        iv: fromBase64(row.iv),
        additionalData: entryAad(userId, entryId, row.version),
      },
      dek,
      fromBase64(row.ciphertext),
    )
    return JSON.parse(decoder.decode(pt)) as VaultItemData
  } catch {
    throw new VaultCryptoError('Entry could not be decrypted (corrupted or tampered)')
  }
}
