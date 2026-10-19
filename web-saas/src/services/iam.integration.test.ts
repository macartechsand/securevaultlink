/// <reference types="node" />
/**
 * IAM / PAM / support-metadata tests (requires 20261021000000_iam_pam_support.sql) against the
 * Supabase DEVELOPMENT project with the throw-away accounts A and B (neither is an administrator).
 *
 *   npm test -- iam.integration
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loadEnv } from 'vite'
import { beforeAll, describe, expect, it } from 'vitest'

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

describe.skipIf(!configured)('IAM, PAM and support metadata (dev project)', () => {
  let a: { client: SupabaseClient; userId: string }
  let b: { client: SupabaseClient; userId: string }

  beforeAll(async () => {
    a = await login(env.TEST_USER_A_EMAIL!, env.TEST_USER_A_PASSWORD!)
    b = await login(env.TEST_USER_B_EMAIL!, env.TEST_USER_B_PASSWORD!)
  })

  it('regular users cannot use any admin function or grant themselves a role', async () => {
    for (const [fn, args] of [
      ['admin_compliance', {}],
      ['admin_events', {}],
      ['admin_list_roles', {}],
      ['admin_user_insights', { p_user: b.userId }],
      ['admin_list_users', {}],
      ['owner_grant_role', { p_user: a.userId, p_role: 'admin', p_hours: null, p_reason: 'self escalation' }],
      ['admin_set_user_policy', { p_user: b.userId, p_require_mfa: true }],
      ['admin_set_setting', { p_key: 'max_users', p_value: '999' }],
    ] as const) {
      expect((await a.client.rpc(fn, args)).error, fn).not.toBeNull()
    }
    expect((await a.client.from('app_admins').insert({ user_id: a.userId, role: 'owner' })).error).not.toBeNull()
    expect((await a.client.from('user_policies').insert({ user_id: a.userId, require_mfa: false })).error).not.toBeNull()
    const status = await a.client.rpc('my_admin_status')
    expect(status.data ?? []).toEqual([])
  })

  it('posture snapshots accept only allow-listed numeric fields and stay private', async () => {
    // Same pattern as the app: create the row if missing (duplicate is fine), then update it.
    // (upsert is intentionally denied: user_id is not an updatable column.)
    await a.client.from('user_preferences').insert({ share_security_metrics: true })
    expect((await a.client.from('user_preferences').update({ share_security_metrics: true }).eq('user_id', a.userId)).error).toBeNull()
    expect((await a.client.from('user_preferences').upsert({ user_id: a.userId, share_security_metrics: true })).error).not.toBeNull()
    expect((await a.client.rpc('report_posture', { p_data: { score: 80, weak: 1, mfa: false } })).error).toBeNull()
    expect((await a.client.rpc('report_posture', { p_data: { title: 'Banco' } })).error).not.toBeNull()
    expect((await a.client.rpc('report_posture', { p_data: { score: 'secret-string' } })).error).not.toBeNull()
    const own = await a.client.from('posture_snapshots').select('data').eq('user_id', a.userId).single()
    expect(own.data?.data).toEqual({ score: 80, weak: 1, mfa: false })
    expect((await b.client.from('posture_snapshots').select('user_id').eq('user_id', a.userId)).data ?? []).toEqual([])
    expect((await a.client.from('posture_snapshots').update({ data: { score: 100 } }).eq('user_id', a.userId)).error).not.toBeNull()
  })

  it('turning metrics off deletes the snapshot', async () => {
    expect((await a.client.from('user_preferences').update({ share_security_metrics: false }).eq('user_id', a.userId)).error).toBeNull()
    await a.client.rpc('report_posture', { p_data: { score: 90 } })
    expect((await a.client.from('posture_snapshots').select('user_id').eq('user_id', a.userId)).data ?? []).toEqual([])
    await a.client.from('user_preferences').update({ share_security_metrics: true }).eq('user_id', a.userId)
  })

  it('support reports are visible to their author only', async () => {
    expect((await a.client.rpc('submit_support_report', { p_report: 'teste de integração' })).error).toBeNull()
    const own = await a.client.from('support_reports').select('report').eq('user_id', a.userId).order('created_at', { ascending: false }).limit(1)
    expect(own.data?.[0]?.report).toBe('teste de integração')
    expect((await b.client.from('support_reports').select('id').eq('user_id', a.userId)).data ?? []).toEqual([])
    expect((await a.client.from('support_reports').insert({ user_id: a.userId, report: 'x' })).error).not.toBeNull()
  })

  it('reports the MFA policy for the caller', async () => {
    const policy = await a.client.rpc('my_security_policy')
    expect(policy.error).toBeNull()
    expect(policy.data?.[0]).toHaveProperty('mfa_required')
  })
})
