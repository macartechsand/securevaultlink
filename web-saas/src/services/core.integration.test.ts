/// <reference types="node" />
/**
 * End-to-end check of the MVP core against the Supabase DEVELOPMENT project, using the app's real
 * cryptography: persistence/consistency, rotation history, user-to-user sharing (view/edit/revoke
 * with key rotation), audit trail, security checks (HIBP, Safe Browsing, strength) and transfer links.
 * Uses the throw-away accounts A and B only and removes everything it creates.
 *
 *   npm test -- core.integration
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loadEnv } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createTransferKeys,
  decryptFileContent,
  decryptFileMetadata,
  decryptHistory,
  decryptItem,
  encryptFileContent,
  encryptFileMetadata,
  encryptHistory,
  encryptItem,
  generateFileKey,
  generateItemKey,
  generateUserKeyPair,
  openSealedItemKey,
  openTransferKey,
  sealItemKeyForRecipient,
  unwrapItemKeyForOwner,
  unwrapUserPrivateKey,
  wrapFileKeyForOwner,
  wrapItemKeyForOwner,
} from '../lib/crypto'
import { checkPwned } from '../lib/health/pwned'
import { analyzeHealth, passwordStrength } from '../lib/health/passwordHealth'
import { emptyItem, normalizeItem } from '../lib/items'

const fileEnv = loadEnv('test', process.cwd(), '')
const env: Record<string, string | undefined> = {
  ...fileEnv,
  ...process.env,
  SUPABASE_TEST_URL: process.env.SUPABASE_TEST_URL || fileEnv.SUPABASE_TEST_URL || fileEnv.VITE_SUPABASE_URL,
  SUPABASE_TEST_ANON_KEY: process.env.SUPABASE_TEST_ANON_KEY || fileEnv.SUPABASE_TEST_ANON_KEY || fileEnv.VITE_SUPABASE_ANON_KEY,
}
const configured = ['SUPABASE_TEST_URL', 'SUPABASE_TEST_ANON_KEY', 'TEST_USER_A_EMAIL', 'TEST_USER_A_PASSWORD', 'TEST_USER_B_EMAIL', 'TEST_USER_B_PASSWORD'].every(
  (key) => Boolean(env[key]),
)
const newClient = () =>
  createClient(env.SUPABASE_TEST_URL!, env.SUPABASE_TEST_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })

async function login(email: string, password: string) {
  const client = newClient()
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error || !data.user) throw new Error(`test login failed: ${error?.message}`)
  return { client, userId: data.user.id }
}

const newDek = () => crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
const inOneHour = () => new Date(Date.now() + 3600_000).toISOString()

describe.skipIf(!configured)('MVP core end-to-end (dev project)', () => {
  let a: { client: SupabaseClient; userId: string }
  let b: { client: SupabaseClient; userId: string }
  let dekA: CryptoKey
  const itemId = crypto.randomUUID()
  const cleanupFiles: { id: string; path: string }[] = []

  beforeAll(async () => {
    a = await login(env.TEST_USER_A_EMAIL!, env.TEST_USER_A_PASSWORD!)
    b = await login(env.TEST_USER_B_EMAIL!, env.TEST_USER_B_PASSWORD!)
    dekA = await newDek()
  })

  afterAll(async () => {
    await a?.client.from('vault_entries').delete().eq('id', itemId)
    for (const f of cleanupFiles) {
      await a?.client.storage.from('vault-files').remove([f.path])
      await a?.client.from('vault_files').delete().eq('id', f.id)
    }
  })

  it('persists an encrypted item and reads it back identically (server sees only ciphertext)', async () => {
    const key = generateItemKey()
    const data = { ...emptyItem('login'), title: 'Teste E2E', username: 'e2e@example.invalid', password: 'Inicial!2026-xyz', url: 'https://example.com', tags: ['e2e'] }
    const blob = await encryptItem(key, a.userId, itemId, data)
    const ins = await a.client
      .from('vault_entries')
      .insert({ id: itemId, ...blob, wrapped_key: await wrapItemKeyForOwner(dekA, a.userId, itemId, key) })
      .select('ciphertext, updated_at')
      .single()
    expect(ins.error).toBeNull()
    expect(ins.data!.ciphertext).not.toContain('Teste E2E')

    const row = await a.client.from('vault_entries').select('id, user_id, ciphertext, iv, version, wrapped_key').eq('id', itemId).single()
    const unwrapped = await unwrapItemKeyForOwner(dekA, a.userId, itemId, row.data!.wrapped_key!)
    expect(normalizeItem(await decryptItem(unwrapped, a.userId, itemId, row.data!))).toMatchObject({ title: 'Teste E2E', tags: ['e2e'] })
  })

  it('rotation keeps an encrypted password history and refuses stale (concurrent) writes', async () => {
    const row = await a.client.from('vault_entries').select('*').eq('id', itemId).single()
    const key = await unwrapItemKeyForOwner(dekA, a.userId, itemId, row.data!.wrapped_key)
    const current = normalizeItem(await decryptItem(key, a.userId, itemId, row.data!))

    const rotations = ['Rotacionada!2026-aaa', 'Rotacionada!2026-bbb']
    let history: { password: string; changedAt: string }[] = []
    let updatedAt = row.data!.updated_at as string
    let previous = current.password
    for (const next of rotations) {
      history = [{ password: previous, changedAt: new Date().toISOString() }, ...history]
      const upd = await a.client
        .from('vault_entries')
        .update({
          ...(await encryptItem(key, a.userId, itemId, { ...current, password: next, passwordUpdatedAt: new Date().toISOString() })),
          history_ciphertext: await encryptHistory(dekA, a.userId, itemId, history),
        })
        .eq('id', itemId)
        .eq('updated_at', updatedAt)
        .select('updated_at')
      expect(upd.data).toHaveLength(1)
      updatedAt = upd.data![0].updated_at
      previous = next
    }

    // A write based on an old version is refused (no silent overwrite).
    const stale = await a.client.from('vault_entries').update({ iv: 'eA==' }).eq('id', itemId).eq('updated_at', row.data!.updated_at).select('id')
    expect(stale.data).toEqual([])

    const saved = await a.client.from('vault_entries').select('*').eq('id', itemId).single()
    expect(normalizeItem(await decryptItem(key, a.userId, itemId, saved.data!)).password).toBe('Rotacionada!2026-bbb')
    const decryptedHistory = await decryptHistory(dekA, a.userId, itemId, saved.data!.history_ciphertext)
    expect(decryptedHistory.map((h) => h.password)).toEqual(['Rotacionada!2026-aaa', 'Inicial!2026-xyz'])
  })

  it('connects users: view → edit → revoke with key rotation', async () => {
    const bDek = await newDek()
    const bPair = await generateUserKeyPair(bDek, b.userId) // local key pair standing in for B's
    const bPrivate = await unwrapUserPrivateKey(bDek, b.userId, bPair.wrappedPrivateKey)
    const row = await a.client.from('vault_entries').select('*').eq('id', itemId).single()
    const key = await unwrapItemKeyForOwner(dekA, a.userId, itemId, row.data!.wrapped_key)

    const share = await a.client
      .from('item_shares')
      .insert({ item_id: itemId, recipient_id: b.userId, permission: 'view', sealed_key: await sealItemKeyForRecipient(bPair.publicKey, key, itemId, b.userId), expires_at: inOneHour() })
      .select('id')
      .single()
    expect(share.error).toBeNull()

    // B reads and decrypts with the sealed key.
    const bShare = await b.client.from('item_shares').select('sealed_key, permission').eq('item_id', itemId).single()
    const bKey = await openSealedItemKey(bPrivate, bPair.publicKey, bShare.data!.sealed_key, itemId, b.userId)
    const bRow = await b.client.from('vault_entries').select('*').eq('id', itemId).single()
    expect(normalizeItem(await decryptItem(bKey, a.userId, itemId, bRow.data!)).password).toBe('Rotacionada!2026-bbb')
    expect((await b.client.from('vault_entries').update({ iv: 'eA==' }).eq('id', itemId).select('id')).data ?? []).toEqual([])

    // Edit permission: B changes the password; A sees it.
    await a.client.from('item_shares').update({ permission: 'edit' }).eq('id', share.data!.id)
    const edited = normalizeItem(await decryptItem(bKey, a.userId, itemId, bRow.data!))
    const bEdit = await b.client
      .from('vault_entries')
      .update(await encryptItem(bKey, a.userId, itemId, { ...edited, password: 'EditadaPorB!2026' }))
      .eq('id', itemId)
      .select('id')
    expect(bEdit.data).toHaveLength(1)
    const aView = await a.client.from('vault_entries').select('*').eq('id', itemId).single()
    expect(normalizeItem(await decryptItem(key, a.userId, itemId, aView.data!)).password).toBe('EditadaPorB!2026')

    // Revoke + rotate the item key: B loses access, the old key no longer decrypts new versions.
    await a.client.from('item_shares').delete().eq('id', share.data!.id)
    const newKey = generateItemKey()
    const rotated = await a.client
      .from('vault_entries')
      .update({
        ...(await encryptItem(newKey, a.userId, itemId, normalizeItem(await decryptItem(key, a.userId, itemId, aView.data!)))),
        wrapped_key: await wrapItemKeyForOwner(dekA, a.userId, itemId, newKey),
      })
      .eq('id', itemId)
      .select('*')
      .single()
    expect(rotated.error).toBeNull()
    expect((await b.client.from('vault_entries').select('id').eq('id', itemId)).data ?? []).toEqual([])
    await expect(decryptItem(bKey, a.userId, itemId, rotated.data!)).rejects.toBeDefined()
  })

  it('keeps a server-side audit trail of every step', async () => {
    const events = await a.client.from('audit_events').select('event, source').eq('target_id', itemId)
    const names = new Set((events.data ?? []).map((e) => e.event))
    for (const e of ['vault.entry_created', 'vault.entry_updated', 'item.shared', 'item.share_permission_changed', 'item.share_removed']) {
      expect(names.has(e), e).toBe(true)
    }
    expect((events.data ?? []).every((e) => e.source === 'server')).toBe(true)
  })

  it('security checks: password strength/reuse, HIBP exposure and Safe Browsing reputation', async () => {
    expect(passwordStrength('123456')).toBe('Weak')
    expect(passwordStrength('vK9#mQ2$zL7@pR4!xT8')).toBe('Strong')
    expect(analyzeHealth([{ id: '1', title: 'a', username: 'u', password: 'x' }, { id: '2', title: 'b', username: 'u', password: 'x' }]).reusedGroups).toEqual([['1', '2']])

    const pwned = await checkPwned('password')
    expect(pwned.status).toBe('ok')
    expect(pwned.status === 'ok' && pwned.count).toBeGreaterThan(1000)

    const { data, error } = await a.client.functions.invoke('check-url', {
      body: { urls: ['http://testsafebrowsing.appspot.com/s/malware.html', 'https://www.google.com/'] },
    })
    expect(error, 'check-url must be deployed with SAFE_BROWSING_API_KEY').toBeNull()
    const results = (data as { results: { url: string; status: string }[] }).results
    expect(results.find((r) => r.url.includes('testsafebrowsing'))?.status).toBe('unsafe')
    expect(results.find((r) => r.url.includes('google.com'))?.status).toBe('no-known-threats')
  })

  it('transfer link: anonymous recipient downloads and decrypts through the transfer function', async () => {
    const fileId = crypto.randomUUID()
    const path = `${a.userId}/${fileId}`
    cleanupFiles.push({ id: fileId, path })
    const fileKey = generateFileKey()
    const plain = new TextEncoder().encode('conteúdo da transferência E2E')
    const cipher = await encryptFileContent(fileKey, fileId, plain)
    expect(
      (
        await a.client.from('vault_files').insert({
          id: fileId,
          kind: 'transfer',
          chunk_size: 1048576,
          size_bytes: cipher.length,
          encrypted_meta: await encryptFileMetadata(fileKey, fileId, { name: 'e2e.txt', type: 'text/plain', size: plain.length }),
          wrapped_key: await wrapFileKeyForOwner(dekA, a.userId, fileId, fileKey),
          storage_path: path,
          expires_at: inOneHour(),
        })
      ).error,
    ).toBeNull()
    await a.client.storage.from('vault-files').upload(path, new Blob([cipher]), { contentType: 'application/octet-stream', cacheControl: '0' })
    expect((await a.client.rpc('finalize_vault_file', { p_file_id: fileId })).data).toBe('ready')

    const transferId = crypto.randomUUID()
    const keys = await createTransferKeys(transferId, fileKey, 'senha-e2e')
    expect(
      (
        await a.client
          .from('transfers')
          .insert({ id: transferId, file_id: fileId, wrapped_key: keys.wrappedFileKey, password_salt: keys.passwordSalt, max_downloads: 1, expires_at: inOneHour() })
      ).error,
    ).toBeNull()

    const anon = newClient()
    const info = await anon.functions.invoke('transfer', { body: { id: transferId, action: 'info' } })
    expect(info.error, 'transfer function must be deployed').toBeNull()
    const opened = await openTransferKey(transferId, keys.linkSecret, info.data.wrappedKey, 'senha-e2e', info.data.passwordSalt)
    expect((await decryptFileMetadata(opened, info.data.fileId, info.data.encryptedMeta)).name).toBe('e2e.txt')
    const dl = await anon.functions.invoke('transfer', { body: { id: transferId, action: 'download' } })
    const bytes = new Uint8Array(await (await fetch(dl.data.url)).arrayBuffer())
    expect(new TextDecoder().decode(await decryptFileContent(opened, info.data.fileId, bytes))).toBe('conteúdo da transferência E2E')

    // Single download: the second attempt is refused.
    const again = await anon.functions.invoke('transfer', { body: { id: transferId, action: 'info' } })
    expect(again.error).not.toBeNull()
  })
})
