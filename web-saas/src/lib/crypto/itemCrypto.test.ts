import { describe, expect, it } from 'vitest'
import { generateUserKeyPair, unwrapUserPrivateKey } from './fileCrypto'
import {
  decryptFolderName,
  decryptHistory,
  decryptItem,
  encryptFolderName,
  encryptHistory,
  encryptItem,
  generateItemKey,
  openSealedItemKey,
  sealItemKeyForRecipient,
  unwrapItemKeyForOwner,
  wrapItemKeyForOwner,
} from './itemCrypto'
import { VaultCryptoError } from './vaultCrypto'

const OWNER = 'aaaaaaaa-0000-0000-0000-00000000000a'
const BOB = 'bbbbbbbb-0000-0000-0000-00000000000b'
const ITEM = 'cccccccc-0000-0000-0000-000000000001'
const OTHER = 'cccccccc-0000-0000-0000-000000000002'
const newDek = () => crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
const data = { type: 'login', title: 'Banco', password: 'S3nha!forte', customFields: [{ label: 'PIN', value: '1234', hidden: true }] }

describe('item keys', () => {
  it('round-trips an item and binds it to owner and id', async () => {
    const key = generateItemKey()
    const blob = await encryptItem(key, OWNER, ITEM, data)
    expect(blob.version).toBe(2)
    expect(blob.ciphertext).not.toContain('S3nha')
    expect(await decryptItem(key, OWNER, ITEM, blob)).toEqual(data)
    await expect(decryptItem(key, BOB, ITEM, blob)).rejects.toBeInstanceOf(VaultCryptoError)
    await expect(decryptItem(key, OWNER, OTHER, blob)).rejects.toBeInstanceOf(VaultCryptoError)
    await expect(decryptItem(generateItemKey(), OWNER, ITEM, blob)).rejects.toBeInstanceOf(VaultCryptoError)
    await expect(decryptItem(key, OWNER, ITEM, { ...blob, version: 1 })).rejects.toBeInstanceOf(VaultCryptoError)
  })

  it('wraps the item key for the owner only', async () => {
    const dek = await newDek()
    const key = generateItemKey()
    const wrapped = await wrapItemKeyForOwner(dek, OWNER, ITEM, key)
    expect(await unwrapItemKeyForOwner(dek, OWNER, ITEM, wrapped)).toEqual(key)
    await expect(unwrapItemKeyForOwner(await newDek(), OWNER, ITEM, wrapped)).rejects.toBeInstanceOf(VaultCryptoError)
    await expect(unwrapItemKeyForOwner(dek, OWNER, OTHER, wrapped)).rejects.toBeInstanceOf(VaultCryptoError)
  })

  it('shares an item key with a recipient, who can read and edit the same item', async () => {
    const bobDek = await newDek()
    const bob = await generateUserKeyPair(bobDek, BOB)
    const bobPrivate = await unwrapUserPrivateKey(bobDek, BOB, bob.wrappedPrivateKey)
    const key = generateItemKey()
    const sealed = await sealItemKeyForRecipient(bob.publicKey, key, ITEM, BOB)
    const opened = await openSealedItemKey(bobPrivate, bob.publicKey, sealed, ITEM, BOB)
    expect(opened).toEqual(key)

    // Recipient edit: still encrypted for the owner's AAD, readable by the owner.
    const edited = await encryptItem(opened, OWNER, ITEM, { ...data, password: 'Nova!senha' })
    expect(await decryptItem(key, OWNER, ITEM, edited)).toMatchObject({ password: 'Nova!senha' })

    // Item-share seals are not interchangeable with another item.
    await expect(openSealedItemKey(bobPrivate, bob.publicKey, sealed, OTHER, BOB)).rejects.toBeInstanceOf(VaultCryptoError)
  })

  it('keeps password history and folder names under the owner DEK', async () => {
    const dek = await newDek()
    const history = [{ password: 'antiga', changedAt: '2026-10-01T00:00:00Z' }]
    const sealedHistory = await encryptHistory(dek, OWNER, ITEM, history)
    expect(await decryptHistory(dek, OWNER, ITEM, sealedHistory)).toEqual(history)
    await expect(decryptHistory(dek, OWNER, OTHER, sealedHistory)).rejects.toBeInstanceOf(VaultCryptoError)

    const name = await encryptFolderName(dek, OWNER, ITEM, 'Banco & cartões')
    expect(await decryptFolderName(dek, OWNER, ITEM, name)).toBe('Banco & cartões')
    await expect(decryptFolderName(await newDek(), OWNER, ITEM, name)).rejects.toBeInstanceOf(VaultCryptoError)
  })
})
