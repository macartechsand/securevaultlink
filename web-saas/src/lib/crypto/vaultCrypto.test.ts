import { describe, expect, it } from 'vitest'
import { fromBase32, fromBase64, toBase32, toBase64 } from './encoding'
import {
  VaultCryptoError,
  disableRecoveryKey,
  enableRecoveryKey,
  hasRecoveryKey,
  resetPasswordWithRecoveryKey,
  unlockWithRecoveryKey,
  changeMasterPassword,
  createVault,
  decryptEntry,
  encryptEntry,
  unlockWithPassword,
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
  it('round-trips base64', () => {
    const bytes = crypto.getRandomValues(new Uint8Array(32))
    expect(fromBase64(toBase64(bytes))).toEqual(bytes)
  })
})

describe('vault key hierarchy', () => {
  it('creates a vault and unlocks it with the master password', async () => {
    const { profile, dek } = await createVault('Master-Password-123!')
    expect(Object.keys(profile).sort()).toEqual(['kdf', 'version', 'wrappedDekPassword'])
    const blob = await encryptEntry(dek, USER, ENTRY, item)
    const unlocked = await unlockWithPassword(profile, 'Master-Password-123!')
    expect(await decryptEntry(unlocked, USER, ENTRY, blob)).toEqual(item)
  })

  it('rejects a wrong master password', async () => {
    const { profile } = await createVault('Master-Password-123!')
    await expect(unlockWithPassword(profile, 'wrong')).rejects.toBeInstanceOf(VaultCryptoError)
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

describe('optional recovery key', () => {
  it('base32 round-trips and rejects invalid input', () => {
    const bytes = crypto.getRandomValues(new Uint8Array(32))
    expect(fromBase32(toBase32(bytes))).toEqual(bytes)
    expect(() => fromBase32('not*valid')).toThrow()
  })

  it('is off by default', async () => {
    const { profile } = await createVault('Master-Password-123!')
    expect(hasRecoveryKey(profile)).toBe(false)
    await expect(unlockWithRecoveryKey(profile, 'AAAA')).rejects.toBeInstanceOf(VaultCryptoError)
  })

  it('requires the master password to enable', async () => {
    const { profile } = await createVault('Master-Password-123!')
    await expect(enableRecoveryKey(profile, 'wrong')).rejects.toBeInstanceOf(VaultCryptoError)
  })

  it('unlocks and resets the master password, keeping entries valid', async () => {
    const { profile, dek } = await createVault('Master-Password-123!')
    const blob = await encryptEntry(dek, USER, ENTRY, item)
    const { profile: withRecovery, recoveryKey } = await enableRecoveryKey(profile, 'Master-Password-123!')
    expect(recoveryKey).toMatch(/^([A-Z2-7]{4}-){12}[A-Z2-7]{4}$/)
    expect(hasRecoveryKey(withRecovery)).toBe(true)

    const viaRecovery = await unlockWithRecoveryKey(withRecovery, recoveryKey.toLowerCase())
    expect(await decryptEntry(viaRecovery, USER, ENTRY, blob)).toEqual(item)

    const reset = await resetPasswordWithRecoveryKey(withRecovery, recoveryKey, 'Brand-New-Password-789!')
    await expect(unlockWithPassword(reset, 'Master-Password-123!')).rejects.toBeInstanceOf(VaultCryptoError)
    const unlocked = await unlockWithPassword(reset, 'Brand-New-Password-789!')
    expect(await decryptEntry(unlocked, USER, ENTRY, blob)).toEqual(item)
    // The recovery key keeps working after the reset.
    await expect(unlockWithRecoveryKey(reset, recoveryKey)).resolves.toBeDefined()
  })

  it('regenerating invalidates the previous key; disabling removes it', async () => {
    const { profile } = await createVault('Master-Password-123!')
    const first = await enableRecoveryKey(profile, 'Master-Password-123!')
    const second = await enableRecoveryKey(first.profile, 'Master-Password-123!')
    expect(second.recoveryKey).not.toEqual(first.recoveryKey)
    await expect(unlockWithRecoveryKey(second.profile, first.recoveryKey)).rejects.toBeInstanceOf(VaultCryptoError)
    await expect(unlockWithRecoveryKey(second.profile, second.recoveryKey)).resolves.toBeDefined()

    await expect(disableRecoveryKey(second.profile, 'wrong')).rejects.toBeInstanceOf(VaultCryptoError)
    const off = await disableRecoveryKey(second.profile, 'Master-Password-123!')
    expect(hasRecoveryKey(off)).toBe(false)
    await expect(unlockWithRecoveryKey(off, second.recoveryKey)).rejects.toBeInstanceOf(VaultCryptoError)
  })

  it('rejects a recovery key from another vault', async () => {
    const a = await enableRecoveryKey((await createVault('Master-Password-123!')).profile, 'Master-Password-123!')
    const b = await enableRecoveryKey((await createVault('Master-Password-123!')).profile, 'Master-Password-123!')
    await expect(unlockWithRecoveryKey(a.profile, b.recoveryKey)).rejects.toBeInstanceOf(VaultCryptoError)
  })
})
