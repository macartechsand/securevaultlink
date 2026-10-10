import { describe, expect, it } from 'vitest'
import { fromBase32, fromBase64, toBase32, toBase64 } from './encoding'
import {
  VaultCryptoError,
  changeMasterPassword,
  createVault,
  decryptEntry,
  encryptEntry,
  resetPasswordWithRecoveryKey,
  unlockWithPassword,
  unlockWithRecoveryKey,
  type VaultItemData,
  type VaultProfile,
} from './vaultCrypto'

const item: VaultItemData = {
  title: 'Example',
  username: 'user@example.com',
  password: 'correct horse battery staple',
  url: 'https://example.com',
  notes: 'unicode: ação ✓',
  category: 'Work',
}
const USER = '11111111-1111-1111-1111-111111111111'
const ENTRY = '22222222-2222-2222-2222-222222222222'

describe('encoding', () => {
  it('round-trips base64 and base32', () => {
    const bytes = crypto.getRandomValues(new Uint8Array(32))
    expect(fromBase64(toBase64(bytes))).toEqual(bytes)
    expect(fromBase32(toBase32(bytes))).toEqual(bytes)
  })

  it('rejects invalid base32', () => {
    expect(() => fromBase32('not*valid')).toThrow()
  })
})

describe('vault key hierarchy', () => {
  it('creates a vault and unlocks it with the master password', async () => {
    const { profile, dek } = await createVault('Master-Password-123!')
    const blob = await encryptEntry(dek, USER, ENTRY, item)
    const unlocked = await unlockWithPassword(profile, 'Master-Password-123!')
    expect(await decryptEntry(unlocked, USER, ENTRY, blob)).toEqual(item)
  })

  it('rejects a wrong master password', async () => {
    const { profile } = await createVault('Master-Password-123!')
    await expect(unlockWithPassword(profile, 'wrong')).rejects.toBeInstanceOf(VaultCryptoError)
  })

  it('unlocks with the recovery key and rejects a wrong one', async () => {
    const { profile, recoveryKey, dek } = await createVault('Master-Password-123!')
    const blob = await encryptEntry(dek, USER, ENTRY, item)
    const unlocked = await unlockWithRecoveryKey(profile, recoveryKey)
    expect(await decryptEntry(unlocked, USER, ENTRY, blob)).toEqual(item)

    const other = await createVault('Another-Password-456!')
    await expect(unlockWithRecoveryKey(profile, other.recoveryKey)).rejects.toBeInstanceOf(
      VaultCryptoError,
    )
    await expect(unlockWithRecoveryKey(profile, 'AAAA-BBBB')).rejects.toBeInstanceOf(
      VaultCryptoError,
    )
  })

  it('changes the master password without invalidating entries', async () => {
    const { profile, dek } = await createVault('Old-Password-123!')
    const blob = await encryptEntry(dek, USER, ENTRY, item)
    const next = await changeMasterPassword(profile, 'Old-Password-123!', 'New-Password-456!')
    expect(next.kdf.salt).not.toEqual(profile.kdf.salt)
    await expect(unlockWithPassword(next, 'Old-Password-123!')).rejects.toBeInstanceOf(
      VaultCryptoError,
    )
    const unlocked = await unlockWithPassword(next, 'New-Password-456!')
    expect(await decryptEntry(unlocked, USER, ENTRY, blob)).toEqual(item)
  })

  it('resets the master password through the recovery key', async () => {
    const { profile, recoveryKey, dek } = await createVault('Old-Password-123!')
    const blob = await encryptEntry(dek, USER, ENTRY, item)
    const next = await resetPasswordWithRecoveryKey(profile, recoveryKey, 'Reset-Password-789!')
    const unlocked = await unlockWithPassword(next, 'Reset-Password-789!')
    expect(await decryptEntry(unlocked, USER, ENTRY, blob)).toEqual(item)
  })

  it('refuses downgraded or out-of-range KDF parameters from the server', async () => {
    const { profile } = await createVault('Master-Password-123!')
    const weak: VaultProfile = { ...profile, kdf: { ...profile.kdf, iterations: 1 } }
    await expect(unlockWithPassword(weak, 'Master-Password-123!')).rejects.toBeInstanceOf(
      VaultCryptoError,
    )
    const huge: VaultProfile = { ...profile, kdf: { ...profile.kdf, iterations: 1e9 } }
    await expect(unlockWithPassword(huge, 'Master-Password-123!')).rejects.toBeInstanceOf(
      VaultCryptoError,
    )
  })

  it('rejects a tampered wrapped key', async () => {
    const { profile } = await createVault('Master-Password-123!')
    const bytes = fromBase64(profile.wrappedDekPassword)
    bytes[bytes.length - 1] ^= 1
    const tampered = { ...profile, wrappedDekPassword: toBase64(bytes) }
    await expect(unlockWithPassword(tampered, 'Master-Password-123!')).rejects.toBeInstanceOf(
      VaultCryptoError,
    )
  })
})

describe('entry encryption', () => {
  it('never contains plaintext and uses a fresh IV each time', async () => {
    const { dek } = await createVault('Master-Password-123!')
    const a = await encryptEntry(dek, USER, ENTRY, item)
    const b = await encryptEntry(dek, USER, ENTRY, item)
    expect(a.iv).not.toEqual(b.iv)
    expect(a.ciphertext).not.toEqual(b.ciphertext)
    const raw = new TextDecoder('latin1').decode(fromBase64(a.ciphertext))
    expect(raw).not.toContain(item.password)
    expect(raw).not.toContain(item.title)
    expect(JSON.stringify(a)).not.toContain(item.password)
  })

  it('detects ciphertext tampering', async () => {
    const { dek } = await createVault('Master-Password-123!')
    const blob = await encryptEntry(dek, USER, ENTRY, item)
    const bytes = fromBase64(blob.ciphertext)
    bytes[0] ^= 1
    await expect(
      decryptEntry(dek, USER, ENTRY, { ...blob, ciphertext: toBase64(bytes) }),
    ).rejects.toBeInstanceOf(VaultCryptoError)
  })

  it('binds ciphertext to its user and row (no swapping)', async () => {
    const { dek } = await createVault('Master-Password-123!')
    const blob = await encryptEntry(dek, USER, ENTRY, item)
    await expect(
      decryptEntry(dek, '33333333-3333-3333-3333-333333333333', ENTRY, blob),
    ).rejects.toBeInstanceOf(VaultCryptoError)
    await expect(
      decryptEntry(dek, USER, '44444444-4444-4444-4444-444444444444', blob),
    ).rejects.toBeInstanceOf(VaultCryptoError)
  })

  it('does not decrypt with a different vault key', async () => {
    const a = await createVault('Master-Password-123!')
    const b = await createVault('Master-Password-123!')
    const blob = await encryptEntry(a.dek, USER, ENTRY, item)
    await expect(decryptEntry(b.dek, USER, ENTRY, blob)).rejects.toBeInstanceOf(VaultCryptoError)
  })

  it('keeps the data key non-extractable once unlocked', async () => {
    const { dek } = await createVault('Master-Password-123!')
    expect(dek.extractable).toBe(false)
    await expect(crypto.subtle.exportKey('raw', dek)).rejects.toBeDefined()
  })
})
