import { describe, expect, it } from 'vitest'
import {
  createTransferKeys,
  decryptFileContent,
  decryptFileMetadata,
  encryptFileContent,
  encryptFileMetadata,
  encryptedSize,
  fromBase64Url,
  generateFileKey,
  generateUserKeyPair,
  openSealedFileKey,
  openTransferKey,
  publicKeyFingerprint,
  sealFileKeyForRecipient,
  toBase64Url,
  unwrapFileKeyForOwner,
  unwrapUserPrivateKey,
  wrapFileKeyForOwner,
} from './fileCrypto'
import { VaultCryptoError } from './vaultCrypto'

const FILE = 'aaaaaaaa-0000-0000-0000-000000000001'
const OTHER_FILE = 'aaaaaaaa-0000-0000-0000-000000000002'
const ALICE = 'bbbbbbbb-0000-0000-0000-00000000000a'
const BOB = 'bbbbbbbb-0000-0000-0000-00000000000b'
const CHUNK = 1024

const newDek = () =>
  crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])

function bytes(n: number) {
  const out = new Uint8Array(n)
  for (let i = 0; i < n; i += 65536) crypto.getRandomValues(out.subarray(i, Math.min(n, i + 65536)))
  return out
}

describe('file content', () => {
  it.each([0, 1, CHUNK - 1, CHUNK, CHUNK + 1, CHUNK * 5 + 7])('round-trips %i bytes', async (size) => {
    const key = generateFileKey()
    const data = bytes(size)
    const ct = await encryptFileContent(key, FILE, data, CHUNK)
    expect(ct.length).toBe(encryptedSize(size, CHUNK))
    expect(await decryptFileContent(key, FILE, ct, CHUNK)).toEqual(data)
  })

  it('works with the default 1 MiB chunk size', async () => {
    const key = generateFileKey()
    const data = bytes(2 * 1024 * 1024 + 3)
    const ct = await encryptFileContent(key, FILE, data)
    expect(await decryptFileContent(key, FILE, ct)).toEqual(data)
  })

  it('does not leak plaintext', async () => {
    const data = new TextEncoder().encode('TOP-SECRET-CONTENT '.repeat(200))
    const ct = await encryptFileContent(generateFileKey(), FILE, data, CHUNK)
    expect(new TextDecoder('latin1').decode(ct)).not.toContain('TOP-SECRET')
  })

  it('rejects wrong key, other file id, tampering, truncation and reordering', async () => {
    const key = generateFileKey()
    const data = bytes(CHUNK * 3)
    const ct = await encryptFileContent(key, FILE, data, CHUNK)
    const sealed = CHUNK + 16

    await expect(decryptFileContent(generateFileKey(), FILE, ct, CHUNK)).rejects.toBeInstanceOf(VaultCryptoError)
    await expect(decryptFileContent(key, OTHER_FILE, ct, CHUNK)).rejects.toBeInstanceOf(VaultCryptoError)

    const flipped = ct.slice()
    flipped[10] ^= 1
    await expect(decryptFileContent(key, FILE, flipped, CHUNK)).rejects.toBeInstanceOf(VaultCryptoError)

    // Dropping the last chunk: the new last chunk was not sealed as "final".
    await expect(decryptFileContent(key, FILE, ct.slice(0, sealed * 2), CHUNK)).rejects.toBeInstanceOf(VaultCryptoError)

    const swapped = new Uint8Array(ct.length)
    swapped.set(ct.subarray(sealed, sealed * 2), 0)
    swapped.set(ct.subarray(0, sealed), sealed)
    swapped.set(ct.subarray(sealed * 2), sealed * 2)
    await expect(decryptFileContent(key, FILE, swapped, CHUNK)).rejects.toBeInstanceOf(VaultCryptoError)
  })

  it('encrypts metadata bound to the file id', async () => {
    const key = generateFileKey()
    const meta = { name: 'contrato.pdf', type: 'application/pdf', size: 1234 }
    const sealed = await encryptFileMetadata(key, FILE, meta)
    expect(sealed).not.toContain('contrato')
    expect(await decryptFileMetadata(key, FILE, sealed)).toEqual(meta)
    await expect(decryptFileMetadata(key, OTHER_FILE, sealed)).rejects.toBeInstanceOf(VaultCryptoError)
  })
})

describe('owner wrapping', () => {
  it('wraps the file key with the vault DEK, bound to owner and file', async () => {
    const dek = await newDek()
    const key = generateFileKey()
    const wrapped = await wrapFileKeyForOwner(dek, ALICE, FILE, key)
    expect(await unwrapFileKeyForOwner(dek, ALICE, FILE, wrapped)).toEqual(key)
    await expect(unwrapFileKeyForOwner(dek, BOB, FILE, wrapped)).rejects.toBeInstanceOf(VaultCryptoError)
    await expect(unwrapFileKeyForOwner(dek, ALICE, OTHER_FILE, wrapped)).rejects.toBeInstanceOf(VaultCryptoError)
    await expect(unwrapFileKeyForOwner(await newDek(), ALICE, FILE, wrapped)).rejects.toBeInstanceOf(VaultCryptoError)
  })
})

describe('asymmetric sharing', () => {
  it('only the intended recipient can open a shared file key', async () => {
    const aliceDek = await newDek()
    const bobDek = await newDek()
    const alice = await generateUserKeyPair(aliceDek, ALICE)
    const bob = await generateUserKeyPair(bobDek, BOB)
    const bobPrivate = await unwrapUserPrivateKey(bobDek, BOB, bob.wrappedPrivateKey)
    const alicePrivate = await unwrapUserPrivateKey(aliceDek, ALICE, alice.wrappedPrivateKey)
    expect(bobPrivate.extractable).toBe(false)

    const fileKey = generateFileKey()
    const sealed = await sealFileKeyForRecipient(bob.publicKey, fileKey, FILE, BOB)
    expect(await openSealedFileKey(bobPrivate, bob.publicKey, sealed, FILE, BOB)).toEqual(fileKey)

    // Wrong recipient, wrong context, tampering.
    await expect(openSealedFileKey(alicePrivate, alice.publicKey, sealed, FILE, ALICE)).rejects.toBeInstanceOf(VaultCryptoError)
    await expect(openSealedFileKey(bobPrivate, bob.publicKey, sealed, OTHER_FILE, BOB)).rejects.toBeInstanceOf(VaultCryptoError)
    const raw = Uint8Array.from(atob(sealed), (c) => c.charCodeAt(0))
    raw[raw.length - 1] ^= 1
    const tampered = btoa(String.fromCharCode(...raw))
    await expect(openSealedFileKey(bobPrivate, bob.publicKey, tampered, FILE, BOB)).rejects.toBeInstanceOf(VaultCryptoError)
  })

  it('seals with a fresh ephemeral key each time', async () => {
    const bob = await generateUserKeyPair(await newDek(), BOB)
    const fileKey = generateFileKey()
    const a = await sealFileKeyForRecipient(bob.publicKey, fileKey, FILE, BOB)
    const b = await sealFileKeyForRecipient(bob.publicKey, fileKey, FILE, BOB)
    expect(a).not.toEqual(b)
  })

  it('private key cannot be unwrapped with another vault or user id', async () => {
    const dek = await newDek()
    const pair = await generateUserKeyPair(dek, ALICE)
    await expect(unwrapUserPrivateKey(await newDek(), ALICE, pair.wrappedPrivateKey)).rejects.toBeInstanceOf(VaultCryptoError)
    await expect(unwrapUserPrivateKey(dek, BOB, pair.wrappedPrivateKey)).rejects.toBeInstanceOf(VaultCryptoError)
  })

  it('produces stable, distinct fingerprints', async () => {
    const a = await generateUserKeyPair(await newDek(), ALICE)
    const b = await generateUserKeyPair(await newDek(), BOB)
    expect(await publicKeyFingerprint(a.publicKey)).toEqual(await publicKeyFingerprint(a.publicKey))
    expect(await publicKeyFingerprint(a.publicKey)).not.toEqual(await publicKeyFingerprint(b.publicKey))
    expect(await publicKeyFingerprint(a.publicKey)).toMatch(/^([0-9A-F]{4} ){7}[0-9A-F]{4}$/)
  })
})

describe('temporary transfers', () => {
  const T = 'cccccccc-0000-0000-0000-000000000001'

  it('opens with the link secret only (no password)', async () => {
    const fileKey = generateFileKey()
    const t = await createTransferKeys(T, fileKey, null)
    expect(t.passwordSalt).toBeNull()
    expect(t.linkSecret).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(await openTransferKey(T, t.linkSecret, t.wrappedFileKey, null, null)).toEqual(fileKey)
    const other = await createTransferKeys(T, fileKey, null)
    await expect(openTransferKey(T, other.linkSecret, t.wrappedFileKey, null, null)).rejects.toBeInstanceOf(VaultCryptoError)
    await expect(openTransferKey('cccccccc-0000-0000-0000-000000000002', t.linkSecret, t.wrappedFileKey, null, null)).rejects.toBeInstanceOf(VaultCryptoError)
    await expect(openTransferKey(T, 'short', t.wrappedFileKey, null, null)).rejects.toBeInstanceOf(VaultCryptoError)
  })

  it('requires both link and password when a password is set', async () => {
    const fileKey = generateFileKey()
    const t = await createTransferKeys(T, fileKey, 'correct horse')
    expect(t.passwordSalt).not.toBeNull()
    expect(await openTransferKey(T, t.linkSecret, t.wrappedFileKey, 'correct horse', t.passwordSalt)).toEqual(fileKey)
    await expect(openTransferKey(T, t.linkSecret, t.wrappedFileKey, 'wrong', t.passwordSalt)).rejects.toBeInstanceOf(VaultCryptoError)
    await expect(openTransferKey(T, t.linkSecret, t.wrappedFileKey, null, null)).rejects.toBeInstanceOf(VaultCryptoError)
  })

  it('base64url round-trips', () => {
    const b = crypto.getRandomValues(new Uint8Array(33))
    expect(fromBase64Url(toBase64Url(b))).toEqual(b)
  })
})
