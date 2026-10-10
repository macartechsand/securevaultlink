/**
 * Client-side file encryption (zero-knowledge). Only WebCrypto primitives are used.
 *
 * File content: random 256-bit file key, AES-256-GCM over fixed-size chunks. Each chunk's nonce is
 * its index (safe because every file has a fresh key) and its AAD binds file id, chunk index and a
 * "final" flag, so chunks cannot be reordered, swapped between files, or truncated.
 *
 * Key distribution per category:
 *  - vault file:   file key wrapped with the user's vault DEK (AES-GCM).
 *  - shared file:  file key sealed to the recipient's ECDH P-256 public key
 *                  (ephemeral ECDH -> HKDF-SHA256 -> AES-GCM, ECIES-style).
 *  - transfer:     file key wrapped with a key derived from a link secret that lives only in the
 *                  URL fragment, optionally combined with a password (PBKDF2).
 */
import { fromBase64, toBase64 } from './encoding'
import { KDF_ITERATIONS, VaultCryptoError } from './vaultCrypto'

export const FILE_FORMAT_VERSION = 1
export const FILE_CHUNK_SIZE = 1024 * 1024
const TAG_BYTES = 16

const subtle = () => globalThis.crypto.subtle
const encoder = new TextEncoder()
const decoder = new TextDecoder()
const randomBytes = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n))

export type FileMetadata = { name: string; type: string; size: number }

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}

const importAes = (raw: Uint8Array<ArrayBuffer>, usages: KeyUsage[] = ['encrypt', 'decrypt']) =>
  subtle().importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, usages)

async function sealAes(key: CryptoKey, plaintext: Uint8Array<ArrayBuffer>, aad: Uint8Array<ArrayBuffer>) {
  const iv = randomBytes(12)
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: aad }, key, plaintext))
  return toBase64(concat(iv, ct))
}

async function openAes(key: CryptoKey, sealed: string, aad: Uint8Array<ArrayBuffer>, what: string) {
  try {
    const data = fromBase64(sealed)
    return new Uint8Array(
      await subtle().decrypt({ name: 'AES-GCM', iv: data.slice(0, 12), additionalData: aad }, key, data.slice(12)),
    )
  } catch {
    throw new VaultCryptoError(`${what} could not be decrypted (wrong key, corrupted or tampered)`)
  }
}

/* ----------------------------- file content ----------------------------- */

export function generateFileKey(): Uint8Array<ArrayBuffer> {
  return randomBytes(32)
}

function chunkNonce(index: number) {
  const iv = new Uint8Array(12)
  new DataView(iv.buffer).setUint32(8, index)
  return iv
}

const chunkAad = (fileId: string, index: number, final: boolean) =>
  encoder.encode(`securevault:file:v${FILE_FORMAT_VERSION}:${fileId}:${index}:${final ? 1 : 0}`)

export function encryptedSize(plainSize: number, chunkSize = FILE_CHUNK_SIZE) {
  const chunks = Math.max(1, Math.ceil(plainSize / chunkSize))
  return plainSize + chunks * TAG_BYTES
}

export async function encryptFileContent(
  fileKey: Uint8Array<ArrayBuffer>,
  fileId: string,
  plaintext: Uint8Array<ArrayBuffer>,
  chunkSize = FILE_CHUNK_SIZE,
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await importAes(fileKey)
  const chunks = Math.max(1, Math.ceil(plaintext.length / chunkSize))
  if (chunks > 0xffffffff) throw new VaultCryptoError('File too large')
  const out: Uint8Array[] = []
  for (let i = 0; i < chunks; i++) {
    const part = plaintext.subarray(i * chunkSize, (i + 1) * chunkSize)
    const ct = await subtle().encrypt(
      { name: 'AES-GCM', iv: chunkNonce(i), additionalData: chunkAad(fileId, i, i === chunks - 1) },
      key,
      part,
    )
    out.push(new Uint8Array(ct))
  }
  return concat(...out)
}

export async function decryptFileContent(
  fileKey: Uint8Array<ArrayBuffer>,
  fileId: string,
  ciphertext: Uint8Array<ArrayBuffer>,
  chunkSize = FILE_CHUNK_SIZE,
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await importAes(fileKey)
  const sealedChunk = chunkSize + TAG_BYTES
  const chunks = Math.max(1, Math.ceil(ciphertext.length / sealedChunk))
  const out: Uint8Array[] = []
  try {
    for (let i = 0; i < chunks; i++) {
      const part = ciphertext.subarray(i * sealedChunk, (i + 1) * sealedChunk)
      const pt = await subtle().decrypt(
        { name: 'AES-GCM', iv: chunkNonce(i), additionalData: chunkAad(fileId, i, i === chunks - 1) },
        key,
        part,
      )
      out.push(new Uint8Array(pt))
    }
  } catch {
    throw new VaultCryptoError('File could not be decrypted (wrong key, corrupted, truncated or tampered)')
  }
  return concat(...out)
}

const metaAad = (fileId: string) => encoder.encode(`securevault:file-meta:v1:${fileId}`)

export async function encryptFileMetadata(fileKey: Uint8Array<ArrayBuffer>, fileId: string, meta: FileMetadata) {
  return sealAes(await importAes(fileKey), encoder.encode(JSON.stringify(meta)), metaAad(fileId))
}

export async function decryptFileMetadata(
  fileKey: Uint8Array<ArrayBuffer>,
  fileId: string,
  sealed: string,
): Promise<FileMetadata> {
  const pt = await openAes(await importAes(fileKey), sealed, metaAad(fileId), 'File details')
  return JSON.parse(decoder.decode(pt)) as FileMetadata
}

/* ------------------------- vault (owner) wrapping ------------------------ */

const ownerWrapAad = (ownerId: string, fileId: string) =>
  encoder.encode(`securevault:file-key:owner:v1:${ownerId}:${fileId}`)

export async function wrapFileKeyForOwner(
  dek: CryptoKey,
  ownerId: string,
  fileId: string,
  fileKey: Uint8Array<ArrayBuffer>,
) {
  return sealAes(dek, fileKey, ownerWrapAad(ownerId, fileId))
}

export async function unwrapFileKeyForOwner(dek: CryptoKey, ownerId: string, fileId: string, wrapped: string) {
  return openAes(dek, wrapped, ownerWrapAad(ownerId, fileId), 'File key')
}

/* ---------------------- user key pair (sharing) ---------------------- */

const ECDH = { name: 'ECDH', namedCurve: 'P-256' } as const
const privateWrapAad = (userId: string) => encoder.encode(`securevault:user-private-key:v1:${userId}`)

/** Creates the user's sharing key pair; the private key is stored wrapped by the vault DEK. */
export async function generateUserKeyPair(dek: CryptoKey, userId: string) {
  const pair = await subtle().generateKey(ECDH, true, ['deriveBits'])
  const spki = new Uint8Array(await subtle().exportKey('spki', pair.publicKey))
  const pkcs8 = new Uint8Array(await subtle().exportKey('pkcs8', pair.privateKey))
  const wrappedPrivateKey = await sealAes(dek, pkcs8, privateWrapAad(userId))
  pkcs8.fill(0)
  return { publicKey: toBase64(spki), wrappedPrivateKey }
}

export async function unwrapUserPrivateKey(dek: CryptoKey, userId: string, wrapped: string): Promise<CryptoKey> {
  const pkcs8 = await openAes(dek, wrapped, privateWrapAad(userId), 'Private key')
  try {
    return await subtle().importKey('pkcs8', pkcs8, ECDH, false, ['deriveBits'])
  } finally {
    pkcs8.fill(0)
  }
}

/** Short fingerprint of a public key, for out-of-band verification. */
export async function publicKeyFingerprint(publicKey: string): Promise<string> {
  const digest = new Uint8Array(await subtle().digest('SHA-256', fromBase64(publicKey)))
  return [...digest.slice(0, 16)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
    .replace(/(.{4})(?=.)/g, '$1 ')
}

const shareInfo = (fileId: string, recipientId: string) =>
  encoder.encode(`securevault:file-share:v1:${fileId}:${recipientId}`)

async function shareKey(privateKey: CryptoKey, publicKey: CryptoKey, salt: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>) {
  const shared = await subtle().deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256)
  const hkdf = await subtle().importKey('raw', shared, 'HKDF', false, ['deriveKey'])
  return subtle().deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    hkdf,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/** Seals a file key to a recipient's public key. Output: base64(ephemeralPub(65) || iv || ct). */
export async function sealFileKeyForRecipient(
  recipientPublicKey: string,
  fileKey: Uint8Array<ArrayBuffer>,
  fileId: string,
  recipientId: string,
): Promise<string> {
  const recipientSpki = fromBase64(recipientPublicKey)
  const recipient = await subtle().importKey('spki', recipientSpki, ECDH, false, [])
  const ephemeral = await subtle().generateKey(ECDH, true, ['deriveBits'])
  const ephemeralRaw = new Uint8Array(await subtle().exportKey('raw', ephemeral.publicKey))
  const info = shareInfo(fileId, recipientId)
  const key = await shareKey(ephemeral.privateKey, recipient, concat(ephemeralRaw, recipientSpki), info)
  const iv = randomBytes(12)
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: info }, key, fileKey))
  return toBase64(concat(ephemeralRaw, iv, ct))
}

export async function openSealedFileKey(
  privateKey: CryptoKey,
  ownPublicKey: string,
  sealed: string,
  fileId: string,
  recipientId: string,
): Promise<Uint8Array<ArrayBuffer>> {
  try {
    const data = fromBase64(sealed)
    const ephemeralRaw = data.slice(0, 65)
    const ephemeral = await subtle().importKey('raw', ephemeralRaw, ECDH, false, [])
    const info = shareInfo(fileId, recipientId)
    const key = await shareKey(privateKey, ephemeral, concat(ephemeralRaw, fromBase64(ownPublicKey)), info)
    return new Uint8Array(
      await subtle().decrypt({ name: 'AES-GCM', iv: data.slice(65, 77), additionalData: info }, key, data.slice(77)),
    )
  } catch {
    throw new VaultCryptoError('Shared file key could not be opened')
  }
}

/* ------------------------- temporary transfers ------------------------- */

const transferInfo = (transferId: string, withPassword: boolean) =>
  encoder.encode(`securevault:transfer:v1:${transferId}:${withPassword ? 'pw' : 'nopw'}`)

/** Base64url without padding, safe for URL fragments. */
export function toBase64Url(bytes: Uint8Array) {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromBase64Url(value: string) {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/')
  return fromBase64(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
}

async function transferKek(
  linkSecret: Uint8Array<ArrayBuffer>,
  transferId: string,
  password: string | null,
  passwordSalt: Uint8Array<ArrayBuffer> | null,
) {
  let ikm = linkSecret
  if (password !== null) {
    if (!passwordSalt) throw new VaultCryptoError('Missing password salt')
    const material = await subtle().importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
    const pw = new Uint8Array(
      await subtle().deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: passwordSalt, iterations: KDF_ITERATIONS }, material, 256),
    )
    ikm = concat(linkSecret, pw)
  }
  const hkdf = await subtle().importKey('raw', ikm, 'HKDF', false, ['deriveKey'])
  return subtle().deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: transferInfo(transferId, password !== null) },
    hkdf,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/**
 * Prepares a transfer: returns the link secret (goes ONLY in the URL fragment) and the wrapped file
 * key + password salt (stored server-side). The server alone can never decrypt the file.
 */
export async function createTransferKeys(transferId: string, fileKey: Uint8Array<ArrayBuffer>, password: string | null) {
  const linkSecret = randomBytes(32)
  const passwordSalt = password !== null ? randomBytes(16) : null
  const kek = await transferKek(linkSecret, transferId, password, passwordSalt)
  const wrappedFileKey = await sealAes(kek, fileKey, transferInfo(transferId, password !== null))
  return {
    linkSecret: toBase64Url(linkSecret),
    wrappedFileKey,
    passwordSalt: passwordSalt ? toBase64(passwordSalt) : null,
  }
}

export async function openTransferKey(
  transferId: string,
  linkSecret: string,
  wrappedFileKey: string,
  password: string | null,
  passwordSalt: string | null,
) {
  let secret: Uint8Array<ArrayBuffer>
  try {
    secret = fromBase64Url(linkSecret)
  } catch {
    throw new VaultCryptoError('Invalid link')
  }
  if (secret.length !== 32) throw new VaultCryptoError('Invalid link')
  const kek = await transferKek(secret, transferId, password, passwordSalt ? fromBase64(passwordSalt) : null)
  return openAes(kek, wrappedFileKey, transferInfo(transferId, password !== null), password !== null ? 'Wrong password or link' : 'Link')
}
