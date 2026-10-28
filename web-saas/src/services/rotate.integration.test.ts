/// <reference types="node" />
/**
 * The `rotate` Edge Function against the REAL platform APIs, using FAKE credentials only: proves the
 * auth gate, input validation, SSRF guard and error handling, and that no submitted value is echoed
 * back. Nothing is changed on any platform (every call fails at authentication). Test account A.
 *
 *   npm test -- rotate.integration
 */
import { loadEnv } from 'vite'
import { beforeAll, describe, expect, it } from 'vitest'
import type { AutoRotation } from '../lib/items'
import { supabase } from '../lib/supabase'
import { rotateCredential } from './rotationService'

const env = { ...loadEnv('test', process.cwd(), ''), ...process.env } as Record<string, string | undefined>
const configured = Boolean(env.TEST_USER_A_EMAIL && env.TEST_USER_A_PASSWORD && env.VITE_SUPABASE_URL)
const FAKE_SECRET = `fake-${crypto.randomUUID()}`
const RATE_LIMITED = /Muitas rotações/

const auto = (connectorId: AutoRotation['connectorId'], config: AutoRotation['config'] = {}): AutoRotation => ({
  connectorId,
  consentAt: new Date().toISOString(),
  config,
  lastRotatedAt: null,
  expiresAt: null,
})

/** Expects a failure with the given message (or the hourly limit, when the suite runs many times). */
async function expectRejected(promise: Promise<unknown>, message: RegExp) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e as Error,
  )
  expect(error).not.toBeNull()
  expect(error!.message).not.toContain(FAKE_SECRET)
  if (!RATE_LIMITED.test(error!.message)) expect(error!.message).toMatch(message)
}

describe.skipIf(!configured)('rotate function (fake credentials, dev project)', () => {
  beforeAll(async () => {
    const { error } = await supabase.auth.signInWithPassword({ email: env.TEST_USER_A_EMAIL!, password: env.TEST_USER_A_PASSWORD! })
    if (error) throw new Error(`login failed: ${error.message}`)
  })

  it('rejects unknown connectors and malformed AWS ids before calling any platform', async () => {
    const { error } = await supabase.functions.invoke('rotate', { body: { connector: 'evil', credential: { secret: 'x' } } })
    expect(error).not.toBeNull()
    await expectRejected(rotateCredential(auto('aws-iam-access-key'), { id: 'ASIATEMPORARY', secret: FAKE_SECRET }), /Access key ID/)
  })

  it('blocks internal addresses for self-hosted GitLab (no SSRF)', async () => {
    for (const baseUrl of ['http://gitlab.com', 'https://169.254.169.254', 'https://localhost', 'https://intranet']) {
      await expectRejected(rotateCredential(auto('gitlab-pat', { baseUrl }), { id: '', secret: FAKE_SECRET }), /HTTPS público/)
    }
  })

  it('reports an invalid current credential from each real platform, changing nothing', async () => {
    await expectRejected(rotateCredential(auto('aws-iam-access-key'), { id: 'AKIAIOSFODNN7EXAMPLE', secret: FAKE_SECRET }), /AWS recusou a chave atual/)
    await expectRejected(rotateCredential(auto('gitlab-pat'), { id: '', secret: FAKE_SECRET }), /GitLab recusou o token atual/)
    await expectRejected(rotateCredential(auto('cloudflare-api-token'), { id: '', secret: FAKE_SECRET }), /Cloudflare recusou o token atual/)
  }, 60_000)

  it('requires a signed-in user', async () => {
    await supabase.auth.signOut()
    const { error } = await supabase.functions.invoke('rotate', { body: { connector: 'gitlab-pat', credential: { secret: FAKE_SECRET } } })
    expect(error).not.toBeNull()
  })
})
