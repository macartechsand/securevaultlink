/// <reference types="node" />
/**
 * RLS isolation tests against a Supabase DEVELOPMENT project with the migration applied.
 * Skipped unless all variables below are set. Use throw-away test accounts only
 * (email confirmation must be disabled for them, or they must already be confirmed):
 *
 *   SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY (optional: default to VITE_* from .env.local),
 *   TEST_USER_A_EMAIL, TEST_USER_A_PASSWORD, TEST_USER_B_EMAIL, TEST_USER_B_PASSWORD
 *
 * They can be exported in the shell or placed in web-saas/.env.test.local (git-ignored).
 *
 *   npm test -- rls.integration
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loadEnv } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Test credentials may also come from web-saas/.env.test.local (git-ignored, never commit it).
const fileEnv = loadEnv('test', process.cwd(), '')
const env: Record<string, string | undefined> = {
  ...fileEnv,
  ...process.env,
  // Default to the dev project configured in web-saas/.env.local.
  SUPABASE_TEST_URL: process.env.SUPABASE_TEST_URL || fileEnv.SUPABASE_TEST_URL || fileEnv.VITE_SUPABASE_URL,
  SUPABASE_TEST_ANON_KEY:
    process.env.SUPABASE_TEST_ANON_KEY || fileEnv.SUPABASE_TEST_ANON_KEY || fileEnv.VITE_SUPABASE_ANON_KEY,
}
const configured = [
  'SUPABASE_TEST_URL',
  'SUPABASE_TEST_ANON_KEY',
  'TEST_USER_A_EMAIL',
  'TEST_USER_A_PASSWORD',
  'TEST_USER_B_EMAIL',
  'TEST_USER_B_PASSWORD',
].every((key) => Boolean(env[key]))

const newClient = () =>
  createClient(env.SUPABASE_TEST_URL!, env.SUPABASE_TEST_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

async function login(email: string, password: string) {
  const client = newClient()
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error || !data.user) throw new Error(`test login failed: ${error?.message}`)
  return { client, userId: data.user.id }
}

describe.skipIf(!configured)('RLS isolation (dev project)', () => {
  let a: { client: SupabaseClient; userId: string }
  let b: { client: SupabaseClient; userId: string }
  const entryId = crypto.randomUUID()
  const blob = { ciphertext: 'dGVzdC1jaXBoZXJ0ZXh0', iv: 'dGVzdC1pdg==', version: 1 }

  beforeAll(async () => {
    a = await login(env.TEST_USER_A_EMAIL!, env.TEST_USER_A_PASSWORD!)
    b = await login(env.TEST_USER_B_EMAIL!, env.TEST_USER_B_PASSWORD!)
    const { error } = await a.client.from('vault_entries').insert({ id: entryId, ...blob })
    expect(error).toBeNull()
  })

  afterAll(async () => {
    await a?.client.from('vault_entries').delete().eq('id', entryId)
  })

  it('owner can read their entry and user_id defaults to auth.uid()', async () => {
    const { data } = await a.client.from('vault_entries').select('id, user_id').eq('id', entryId)
    expect(data).toEqual([{ id: entryId, user_id: a.userId }])
  })

  it("another user cannot read, update or delete the owner's entry", async () => {
    const read = await b.client.from('vault_entries').select('id').eq('id', entryId)
    expect(read.data ?? []).toEqual([])

    const upd = await b.client.from('vault_entries').update({ ciphertext: 'hacked' }).eq('id', entryId).select('id')
    expect(upd.data ?? []).toEqual([])

    const del = await b.client.from('vault_entries').delete().eq('id', entryId).select('id')
    expect(del.data ?? []).toEqual([])

    const still = await a.client.from('vault_entries').select('ciphertext').eq('id', entryId)
    expect(still.data).toEqual([{ ciphertext: blob.ciphertext }])
  })

  it('a user cannot insert rows as someone else', async () => {
    const { error } = await b.client
      .from('vault_entries')
      .insert({ id: crypto.randomUUID(), user_id: a.userId, ...blob })
    expect(error).not.toBeNull()
  })

  it('a user cannot reassign their row to someone else', async () => {
    const { data } = await a.client.from('vault_entries').update({ user_id: b.userId }).eq('id', entryId).select('id')
    expect(data ?? []).toEqual([])
  })

  it('anonymous clients get nothing and cannot write', async () => {
    const anon = newClient()
    const read = await anon.from('vault_entries').select('id')
    expect(read.data ?? []).toEqual([])
    const write = await anon.from('vault_entries').insert({ id: crypto.randomUUID(), ...blob })
    expect(write.error).not.toBeNull()
    const profiles = await anon.from('vault_profiles').select('user_id')
    expect(profiles.data ?? []).toEqual([])
  })

  it('profiles are isolated per user', async () => {
    const own = await a.client.from('vault_profiles').select('user_id')
    for (const row of own.data ?? []) expect(row.user_id).toBe(a.userId)
    const forged = await b.client.from('vault_profiles').update({ wrapped_dek_password: 'x' }).eq('user_id', a.userId).select('user_id')
    expect(forged.data ?? []).toEqual([])
  })
})
