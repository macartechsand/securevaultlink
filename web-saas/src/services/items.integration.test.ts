/// <reference types="node" />
/**
 * Secured Items isolation tests (requires migration 20261019000000_secured_items.sql) against the
 * Supabase DEVELOPMENT project, with the same throw-away accounts as rls.integration.test.ts.
 *
 *   npm test -- items.integration
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

const inOneHour = () => new Date(Date.now() + 3600_000).toISOString()

describe.skipIf(!configured)('secured items isolation (dev project)', () => {
  let a: { client: SupabaseClient; userId: string }
  let b: { client: SupabaseClient; userId: string }
  const v2 = crypto.randomUUID()
  const v1 = crypto.randomUUID()
  const folder = crypto.randomUUID()
  let shareId = ''

  beforeAll(async () => {
    a = await login(env.TEST_USER_A_EMAIL!, env.TEST_USER_A_PASSWORD!)
    b = await login(env.TEST_USER_B_EMAIL!, env.TEST_USER_B_PASSWORD!)
    const ins = await a.client.from('vault_entries').insert([
      { id: v2, ciphertext: 'djI=', iv: 'aXY=', version: 2, wrapped_key: 'd2s=' },
      { id: v1, ciphertext: 'djE=', iv: 'aXY=', version: 1 },
    ])
    expect(ins.error).toBeNull()
  })

  afterAll(async () => {
    await a?.client.from('vault_entries').delete().in('id', [v2, v1])
    await a?.client.from('vault_folders').delete().eq('id', folder)
  })

  it('only v2 items can be shared, and free shares expire within 48 h', async () => {
    const legacy = await a.client.from('item_shares').insert({ item_id: v1, recipient_id: b.userId, sealed_key: 'x', expires_at: inOneHour() })
    expect(legacy.error).not.toBeNull()
    const tooLong = await a.client
      .from('item_shares')
      .insert({ item_id: v2, recipient_id: b.userId, sealed_key: 'x', expires_at: new Date(Date.now() + 49 * 3600_000).toISOString() })
    expect(tooLong.error).not.toBeNull()
    const forged = await b.client.from('item_shares').insert({ item_id: v2, recipient_id: b.userId, owner_id: a.userId, sealed_key: 'x', expires_at: inOneHour() })
    expect(forged.error).not.toBeNull()
  })

  it('view share: recipient reads but cannot write or delete', async () => {
    expect((await b.client.from('vault_entries').select('id').eq('id', v2)).data ?? []).toEqual([])
    const share = await a.client
      .from('item_shares')
      .insert({ item_id: v2, recipient_id: b.userId, permission: 'view', sealed_key: 'c2VhbGVk', expires_at: inOneHour() })
      .select('id, owner_email, recipient_email')
      .single()
    expect(share.error).toBeNull()
    shareId = share.data!.id
    expect(share.data?.recipient_email).toBe(env.TEST_USER_B_EMAIL)

    expect((await b.client.from('vault_entries').select('id, user_id').eq('id', v2)).data).toEqual([{ id: v2, user_id: a.userId }])
    expect((await b.client.from('vault_entries').select('id').eq('id', v1)).data ?? []).toEqual([])
    const write = await b.client.from('vault_entries').update({ ciphertext: 'aGFjaw==' }).eq('id', v2).select('id')
    expect(write.data ?? []).toEqual([])
    await b.client.from('vault_entries').delete().eq('id', v2)
    expect((await a.client.from('vault_entries').select('id').eq('id', v2)).data).toHaveLength(1)
    // Recipient cannot escalate their own permission.
    const escalate = await b.client.from('item_shares').update({ permission: 'edit' }).eq('id', shareId).select('id')
    expect(escalate.data ?? []).toEqual([])
  })

  it("edit share: recipient may change the content but never the owner's key or history", async () => {
    expect((await a.client.from('item_shares').update({ permission: 'edit' }).eq('id', shareId)).error).toBeNull()
    const edit = await b.client.from('vault_entries').update({ ciphertext: 'ZWRpdGFkbw==', iv: 'aXYy' }).eq('id', v2).select('id')
    expect(edit.data).toEqual([{ id: v2 }])
    expect((await b.client.from('vault_entries').update({ wrapped_key: 'b3V0cm8=' }).eq('id', v2)).error).not.toBeNull()
    expect((await b.client.from('vault_entries').update({ history_ciphertext: 'aA==' }).eq('id', v2)).error).not.toBeNull()
    expect((await b.client.from('vault_entries').update({ version: 1 }).eq('id', v2)).error).not.toBeNull()
    const owner = await a.client.from('vault_entries').select('ciphertext, wrapped_key').eq('id', v2).single()
    expect(owner.data).toEqual({ ciphertext: 'ZWRpdGFkbw==', wrapped_key: 'd2s=' })
  })

  it('revoking removes the recipient access; audit events are recorded', async () => {
    const audit = await a.client.from('audit_events').select('event').eq('target_id', v2).eq('event', 'item.shared')
    expect(audit.data?.length).toBeGreaterThan(0)
    expect((await a.client.from('item_shares').delete().eq('id', shareId)).error).toBeNull()
    expect((await b.client.from('vault_entries').select('id').eq('id', v2)).data ?? []).toEqual([])
    const write = await b.client.from('vault_entries').update({ ciphertext: 'eA==' }).eq('id', v2).select('id')
    expect(write.data ?? []).toEqual([])
  })

  it('folders are private to their owner', async () => {
    expect((await a.client.from('vault_folders').insert({ id: folder, name_ciphertext: 'Zm9sZGVy' })).error).toBeNull()
    expect((await b.client.from('vault_folders').select('id').eq('id', folder)).data ?? []).toEqual([])
    const rename = await b.client.from('vault_folders').update({ name_ciphertext: 'eA==' }).eq('id', folder).select('id')
    expect(rename.data ?? []).toEqual([])
    expect((await b.client.from('vault_folders').insert({ id: crypto.randomUUID(), user_id: a.userId, name_ciphertext: 'eA==' })).error).not.toBeNull()
  })
})
