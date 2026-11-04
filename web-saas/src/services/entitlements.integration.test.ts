/// <reference types="node" />
/**
 * Plan entitlements enforced by the database (migration 20261105000000) against the Supabase
 * DEVELOPMENT project. Same variables as rls.integration.test.ts (test accounts A and B, both on the
 * free plan). Uses 1 of account A's daily URL checks per run.
 *
 *   npm test -- entitlements.integration
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loadEnv } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const fileEnv = loadEnv('test', process.cwd(), '')
const env: Record<string, string | undefined> = {
  ...fileEnv,
  ...process.env,
  SUPABASE_TEST_URL: process.env.SUPABASE_TEST_URL || fileEnv.SUPABASE_TEST_URL || fileEnv.VITE_SUPABASE_URL,
  SUPABASE_TEST_ANON_KEY:
    process.env.SUPABASE_TEST_ANON_KEY || fileEnv.SUPABASE_TEST_ANON_KEY || fileEnv.VITE_SUPABASE_ANON_KEY,
}
const configured = ['SUPABASE_TEST_URL', 'SUPABASE_TEST_ANON_KEY', 'TEST_USER_A_EMAIL', 'TEST_USER_A_PASSWORD'].every((k) =>
  Boolean(env[k]),
)

const newClient = () =>
  createClient(env.SUPABASE_TEST_URL!, env.SUPABASE_TEST_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })

type Ent = { plan: string; max_items: number; items: number; url_checks_day: number; url_checks_used: number }

describe.skipIf(!configured)('plan entitlements (dev project)', () => {
  let a: SupabaseClient
  const created: string[] = []
  const blob = { ciphertext: 'dGVzdC1jaXBoZXJ0ZXh0', iv: 'dGVzdC1pdg==', version: 1 }

  beforeAll(async () => {
    a = newClient()
    const { error } = await a.auth.signInWithPassword({ email: env.TEST_USER_A_EMAIL!, password: env.TEST_USER_A_PASSWORD! })
    expect(error).toBeNull()
  })

  afterAll(async () => {
    if (created.length) await a.from('vault_entries').delete().in('id', created)
  })

  const entitlements = async () => {
    const { data, error } = await a.rpc('my_entitlements')
    expect(error).toBeNull()
    return data as Ent
  }

  it('reports the plan limits and current usage', async () => {
    const e = await entitlements()
    expect(e.plan).toBe('free')
    expect(e.max_items).toBeGreaterThan(0)
    expect(e.items).toBeGreaterThanOrEqual(0)
    expect(e.url_checks_day).toBeGreaterThan(0)
  })

  it('the database refuses a new item above the free limit, while existing items stay editable', async () => {
    const start = await entitlements()
    expect(start.items).toBeLessThanOrEqual(start.max_items)
    for (let i = start.items; i < start.max_items; i++) {
      const id = crypto.randomUUID()
      const { error } = await a.from('vault_entries').insert({ id, ...blob })
      expect(error).toBeNull()
      created.push(id)
    }
    const over = await a.from('vault_entries').insert({ id: crypto.randomUUID(), ...blob })
    expect(over.error?.message).toMatch(/ITEM_LIMIT_REACHED/)

    if (created.length) {
      const edit = await a.from('vault_entries').update({ ciphertext: 'ZWRpdGVk' }).eq('id', created[0]).select('id')
      expect(edit.error).toBeNull()
      expect(edit.data).toHaveLength(1)
    }
    expect((await entitlements()).items).toBe(start.max_items)

    // Freeing one slot lets the user add again.
    if (created.length) {
      await a.from('vault_entries').delete().eq('id', created.pop()!)
      const id = crypto.randomUUID()
      const again = await a.from('vault_entries').insert({ id, ...blob })
      expect(again.error).toBeNull()
      created.push(id)
    }
  })

  it('URL checks are counted per day in the database and bounded per call', async () => {
    const before = await entitlements()
    const { data, error } = await a.rpc('consume_url_checks', { p_count: 1 })
    expect(error).toBeNull()
    if (before.url_checks_used + 1 <= before.url_checks_day) {
      expect(data).toBe(true)
      expect((await entitlements()).url_checks_used).toBe(before.url_checks_used + 1)
    } else {
      expect(data).toBe(false)
    }
    const tooMany = await a.rpc('consume_url_checks', { p_count: 51 })
    expect(tooMany.error?.message).toMatch(/invalid count/)
  })

  it('anonymous callers get nothing and cannot consume quota', async () => {
    const anon = newClient()
    const ent = await anon.rpc('my_entitlements')
    expect(ent.data ?? null).toBeNull()
    const consume = await anon.rpc('consume_url_checks', { p_count: 1 })
    expect(consume.data ?? null).not.toBe(true)
  })
})
