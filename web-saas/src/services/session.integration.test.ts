/// <reference types="node" />
/**
 * Exercises the app's REAL vault session path with its own services (the same calls the browser
 * makes): create/replace a vault for test account A, unlock it with the master password, create and
 * load items (v2), save with history, the sharing key pair, and the forgotten-master-password
 * reset (account Edge Function). Test account A only.
 *
 *   npm test -- session.integration
 */
import { loadEnv } from 'vite'
import { beforeAll, describe, expect, it } from 'vitest'
import { createVault, unlockWithPassword } from '../lib/crypto'
import { emptyItem } from '../lib/items'
import { supabase } from '../lib/supabase'
import * as ops from '../state/itemOps'
import { resetMyVault } from './authService'
import { ensureUserKeyPair } from './fileService'
import * as vault from './vaultService'

const env = { ...loadEnv('test', process.cwd(), ''), ...process.env } as Record<string, string | undefined>
const configured = Boolean(env.TEST_USER_A_EMAIL && env.TEST_USER_A_PASSWORD && env.VITE_SUPABASE_URL)
const MASTER = `Teste-Mestra-${crypto.randomUUID()}`

describe.skipIf(!configured)('vault session path (dev project, account A)', () => {
  let userId = ''

  beforeAll(async () => {
    const { data, error } = await supabase.auth.signInWithPassword({ email: env.TEST_USER_A_EMAIL!, password: env.TEST_USER_A_PASSWORD! })
    if (error || !data.user) throw new Error(`login failed: ${error?.message}`)
    userId = data.user.id
  })

  it('creates (or replaces) the vault profile and unlocks it again from the server copy', async () => {
    const created = await createVault(MASTER)
    const existing = await vault.fetchProfile()
    if (existing) await vault.updateProfile(userId, created.profile)
    else await vault.createProfile(created.profile)

    const fromServer = await vault.fetchProfile()
    expect(fromServer).not.toBeNull()
    expect(fromServer!.kdf).toEqual(created.profile.kdf)
    expect(fromServer!.wrappedDekPassword).toBe(created.profile.wrappedDekPassword)
    await expect(unlockWithPassword(fromServer!, MASTER)).resolves.toBeDefined()
    await expect(unlockWithPassword(fromServer!, 'senha-errada')).rejects.toBeDefined()
  })

  it('unlock → sharing keys → create, reload, edit with history (same calls as the app)', async () => {
    const profile = (await vault.fetchProfile())!
    const dek = await unlockWithPassword(profile, MASTER)
    const ctx = { dek, userId }

    // This test replaces A's vault (new DEK) on every run, so a key pair stored by a PREVIOUS run is
    // wrapped by an old DEK and cannot be opened. Real vaults never change their DEK (changing the
    // master password re-wraps the same DEK), so in the app this only happens in tests.
    let keyPair: Awaited<ReturnType<typeof ensureUserKeyPair>> | null = null
    try {
      keyPair = await ensureUserKeyPair(ctx)
      expect(keyPair.publicKey.length).toBeGreaterThan(50)
      expect((await ensureUserKeyPair(ctx)).publicKey).toBe(keyPair.publicKey) // stable on second unlock
    } catch (error) {
      expect(String(error)).toMatch(/Private key could not be decrypted/)
    }

    const keys: ops.ItemKeys = new Map()
    const item = await ops.createItem(ctx, keys, { ...emptyItem('login'), title: 'Sessão E2E', password: 'Primeira!2026-abc' })
    try {
      // Leftovers from earlier runs (old DEK / old key pair) may fail to open; this run's item must not.
      const reloaded = await ops.loadItems(ctx, keyPair, new Map())
      const found = reloaded.items.find((i) => i.id === item.id)
      expect(found?.data.title).toBe('Sessão E2E')

      const saved = await ops.saveItem(ctx, keys, found!, { ...found!.data, password: 'Segunda!2026-def' })
      expect(saved.data.password).toBe('Segunda!2026-def')
      expect((await ops.loadHistory(ctx, item.id)).map((h) => h.password)).toEqual(['Primeira!2026-abc'])
    } finally {
      await vault.deleteEntry(item.id)
    }
  })

  it('"Esqueci a senha mestra" erases the vault and lets the user create a new one', async () => {
    const profile = (await vault.fetchProfile())!
    const ctx = { dek: await unlockWithPassword(profile, MASTER), userId }
    await ops.createItem(ctx, new Map(), { ...emptyItem('login'), title: 'Antes do reset' })

    await resetMyVault()
    expect(await vault.fetchProfile()).toBeNull()
    expect((await supabase.from('vault_entries').select('id').eq('user_id', userId)).data ?? []).toEqual([])
    expect((await supabase.from('user_keys').select('user_id').eq('user_id', userId)).data ?? []).toEqual([])

    // Same account, brand-new vault with a new master password.
    const fresh = await createVault(`${MASTER}-novo`)
    await vault.createProfile(fresh.profile)
    await expect(unlockWithPassword((await vault.fetchProfile())!, `${MASTER}-novo`)).resolves.toBeDefined()
    expect((await ensureUserKeyPair({ dek: fresh.dek, userId })).publicKey.length).toBeGreaterThan(50)
  })
})
