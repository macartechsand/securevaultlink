// Supabase Edge Function: on-demand ("1 click") automatic rotation through platform APIs.
//
// Runs only while the user is present: the browser decrypts the item, sends the CURRENT credential
// here over TLS, and this function calls the platform, verifies the NEW credential and returns it.
// Nothing is stored and no credential value is ever logged: the browser re-encrypts the result into
// the vault. This partially breaks zero-knowledge for these items only, so the app requires an
// explicit per-item consent (see docs/architecture/connectors-rotation.md).
//
// Connectors (status "beta" until tested against each real platform):
//  - aws-iam-access-key:      CreateAccessKey → verify (sts:GetCallerIdentity, same ARN) → the app saves
//                             → action "revoke_old" deletes the previous key (signed with the new one).
//  - aws-iam-console:         UpdateLoginProfile, signed with an admin access key the item references
//                             (another vault item); console sign-in cannot be verified by API.
//  - gcp-service-account-key: create key → verify (OAuth token with the new key) → save → revoke_old.
//  - entra-app-secret:        Graph addPassword → verify (client-credentials token) → save → revoke_old.
//  - entra-user:              Microsoft 365 / Entra work-account password (Graph passwordProfile), with an
//                             admin app registration from another vault item.
//  - google-workspace-user:   Workspace user password (Admin SDK users.update), with a service account
//                             (domain-wide delegation) from another vault item, impersonating an admin.
//  - gitlab-pat:              POST /personal_access_tokens/self/rotate (GitLab revokes the old token) → verify.
//  - cloudflare-api-token:    /user/tokens/verify → PUT /user/tokens/{id}/value ("roll") → verify.
//
// Deploy (JWT verification ON):  supabase functions deploy rotate
import { createClient } from 'npm:@supabase/supabase-js@2'
import { sigv4Authorization } from '../_shared/sigv4.ts'
import { RotationError, type Result, sleep, strongPassword, timedFetch } from './common.ts'
import { revokeOldEntraSecret, rotateEntraSecret, rotateEntraUser } from './entra.ts'
import { revokeOldGcpKey, rotateGcpKey, rotateWorkspaceUser } from './google.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

const CONNECTORS = [
  'aws-iam-access-key', 'aws-iam-console', 'gcp-service-account-key', 'entra-app-secret', 'entra-user', 'google-workspace-user',
  'gitlab-pat', 'cloudflare-api-token',
] as const
/** Login connectors: the app sends an admin credential from another vault item, never the current password. */
const ADMIN_LINKED: ConnectorId[] = ['aws-iam-console', 'entra-user', 'google-workspace-user']
type ConnectorId = (typeof CONNECTORS)[number]
/** Connectors with a second phase (the old credential is removed after the vault saved the new one). */
const REVOCABLE: ConnectorId[] = ['aws-iam-access-key', 'gcp-service-account-key', 'entra-app-secret']
const MAX_PER_HOUR = 20

function jwtClaims(authHeader: string): Record<string, unknown> {
  try {
    const payload = authHeader.replace(/^Bearer\s+/i, '').split('.')[1]
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
  } catch {
    return {}
  }
}

// ------------------------------------------------------------------ AWS (Signature V4, Query API)
type AwsCred = { id: string; secret: string }

async function awsCall(service: 'iam' | 'sts', params: Record<string, string>, cred: AwsCred) {
  const host = `${service}.amazonaws.com`
  const contentType = 'application/x-www-form-urlencoded; charset=utf-8'
  const body = new URLSearchParams(params).toString()
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '')
  // IAM and the global STS endpoint both sign for us-east-1.
  const authorization = await sigv4Authorization({
    method: 'POST', host, region: 'us-east-1', service, query: '', body, contentType, amzDate,
    accessKeyId: cred.id, secretAccessKey: cred.secret,
  })
  const res = await timedFetch(`https://${host}/`, {
    method: 'POST',
    headers: { 'content-type': contentType, 'x-amz-date': amzDate, authorization },
    body,
  })
  return { ok: res.ok, status: res.status, text: await res.text() }
}
const AWS_KEY_ID = /^AKIA[A-Z0-9]{16}$/
const xmlTag = (xml: string, tag: string) => xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))?.[1] ?? null

async function awsIdentity(cred: AwsCred) {
  const r = await awsCall('sts', { Action: 'GetCallerIdentity', Version: '2011-06-15' }, cred)
  return r.ok ? xmlTag(r.text, 'Arn') : null
}

async function rotateAws(cred: AwsCred): Promise<Result> {
  if (!AWS_KEY_ID.test(cred.id)) {
    throw new RotationError('bad_input', 'Informe o Access key ID (AKIA…) no campo Usuário. Credenciais temporárias (ASIA…) não são rotacionáveis.')
  }
  const arn = await awsIdentity(cred)
  if (!arn) throw new RotationError('current_invalid', 'A AWS recusou a chave atual. Confira o Access key ID e a Secret no item.')
  if (/:root$/.test(arn)) throw new RotationError('root_account', 'Por segurança, chaves da conta root não são rotacionadas por aqui.')

  const created = await awsCall('iam', { Action: 'CreateAccessKey', Version: '2010-05-08' }, cred)
  if (!created.ok) {
    if (/LimitExceeded/.test(created.text)) {
      throw new RotationError('key_limit', 'Este usuário IAM já tem 2 chaves. Remova a que não está em uso no console da AWS e tente de novo.')
    }
    if (/AccessDenied/.test(created.text)) throw new RotationError('permission', 'A chave atual não tem a permissão iam:CreateAccessKey no próprio usuário.')
    throw new RotationError('platform_error', 'A AWS não criou a nova chave. Nada foi alterado.', 502)
  }
  const next = { id: xmlTag(created.text, 'AccessKeyId') ?? '', secret: xmlTag(created.text, 'SecretAccessKey') ?? '' }
  if (!next.id || !next.secret) throw new RotationError('platform_error', 'Resposta inesperada da AWS.', 502)

  // New IAM keys take a few seconds to propagate.
  for (let attempt = 0; attempt < 8; attempt++) {
    await sleep(attempt === 0 ? 3000 : 2000)
    if ((await awsIdentity(next)) === arn) return { secret: next.secret, identifier: next.id, revokeOldId: cred.id, verified: true }
  }
  // Two-phase: verification failed, so undo (remove the new key) and keep the current one.
  await awsCall('iam', { Action: 'DeleteAccessKey', Version: '2010-05-08', AccessKeyId: next.id }, cred).catch(() => null)
  throw new RotationError('verify_failed', 'A nova chave não pôde ser verificada e foi removida. A chave atual continua valendo.', 502)
}

async function revokeOldAws(cred: AwsCred, oldId: string) {
  if (!AWS_KEY_ID.test(oldId) || oldId === cred.id) throw new RotationError('bad_input', 'Chave antiga inválida.')
  const r = await awsCall('iam', { Action: 'DeleteAccessKey', Version: '2010-05-08', AccessKeyId: oldId }, cred)
  if (!r.ok && !/NoSuchEntity/.test(r.text)) {
    throw new RotationError('revoke_failed', `Não foi possível remover a chave antiga ${oldId}. Remova-a no console da AWS.`, 502)
  }
}

/** Console password of an IAM user, changed with an admin key (iam:UpdateLoginProfile). */
async function rotateAwsConsole(userName: string, adminCred: AwsCred): Promise<Result> {
  if (!/^[\w+=,.@-]{1,64}$/.test(userName)) throw new RotationError('bad_input', 'Coloque o nome do usuário IAM em "Usuário".')
  if (!AWS_KEY_ID.test(adminCred.id) || !adminCred.secret) {
    throw new RotationError('bad_input', 'Vincule um segredo com uma access key administrativa (AKIA…) em "Rotação automática".')
  }
  const arn = await awsIdentity(adminCred)
  if (!arn) throw new RotationError('current_invalid', 'A AWS recusou a access key administrativa vinculada.')
  if (/:root$/.test(arn)) throw new RotationError('root_account', 'Por segurança, use uma access key de um usuário IAM, não da conta root.')
  const password = strongPassword(32)
  const r = await awsCall('iam', { Action: 'UpdateLoginProfile', Version: '2010-05-08', UserName: userName, Password: password, PasswordResetRequired: 'false' }, adminCred)
  if (!r.ok) {
    if (/NoSuchEntity/.test(r.text)) throw new RotationError('not_found', 'Este usuário IAM não existe ou não tem senha de console.')
    if (/PasswordPolicyViolation/.test(r.text)) throw new RotationError('policy', 'A política de senhas da conta AWS recusou a nova senha (por exemplo, reutilização). Nada foi alterado.')
    if (/AccessDenied/.test(r.text)) throw new RotationError('permission', 'A access key vinculada precisa de iam:UpdateLoginProfile para este usuário.')
    throw new RotationError('platform_error', 'A AWS não trocou a senha. Nada foi alterado.', 502)
  }
  return { secret: password, verified: false, warning: 'A AWS aplicou a nova senha. O login no console não é verificável por API: confira na próxima entrada.' }
}

// ------------------------------------------------------------------ GitLab
function gitlabBase(raw: string | undefined) {
  let url: URL
  try {
    url = new URL((raw ?? '').trim() || 'https://gitlab.com')
  } catch {
    throw new RotationError('bad_input', 'Endereço do GitLab inválido.')
  }
  const host = url.hostname.toLowerCase()
  // Public HTTPS hosts only (no IP literals, localhost or internal names): no SSRF through this field.
  if (url.protocol !== 'https:' || !host.includes('.') || /^[\d.]+$/.test(host) || host.includes(':') || /(^|\.)(localhost|local|internal)$/.test(host)) {
    throw new RotationError('bad_input', 'Use o endereço HTTPS público do GitLab (ex.: https://gitlab.com).')
  }
  return url.origin
}

async function rotateGitlab(token: string, config: Record<string, string>): Promise<Result> {
  const base = gitlabBase(config.baseUrl)
  const days = Number(config.expiresInDays || 90)
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new RotationError('bad_input', 'Validade do novo token: de 1 a 365 dias.')
  const expires = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
  const res = await timedFetch(`${base}/api/v4/personal_access_tokens/self/rotate`, {
    method: 'POST',
    headers: { 'PRIVATE-TOKEN': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expires_at: expires }),
  })
  if (res.status === 401) throw new RotationError('current_invalid', 'O GitLab recusou o token atual (expirado, revogado ou incorreto).')
  if (res.status === 403) throw new RotationError('permission', 'O token precisa do escopo api ou self_rotate para se rotacionar.')
  if (!res.ok) throw new RotationError('platform_error', `O GitLab recusou a rotação (HTTP ${res.status}). Nada foi alterado.`, 502)
  const body = (await res.json().catch(() => ({}))) as { token?: string; expires_at?: string }
  if (!body.token) throw new RotationError('platform_error', 'Resposta inesperada do GitLab.', 502)
  // GitLab already revoked the old token: from here on the new one MUST reach the user.
  const check = await timedFetch(`${base}/api/v4/personal_access_tokens/self`, { headers: { 'PRIVATE-TOKEN': body.token } }).catch(() => null)
  const verified = Boolean(check?.ok)
  return { secret: body.token, expiresAt: body.expires_at ?? expires, verified }
}

// ------------------------------------------------------------------ Cloudflare
const CF = 'https://api.cloudflare.com/client/v4'
async function cfVerify(token: string) {
  const res = await timedFetch(`${CF}/user/tokens/verify`, { headers: { Authorization: `Bearer ${token}` } })
  const body = (await res.json().catch(() => ({}))) as { success?: boolean; result?: { id?: string; status?: string; expires_on?: string } }
  return res.ok && body.success && body.result?.status === 'active' ? body.result : null
}

async function rotateCloudflare(token: string): Promise<Result> {
  const current = await cfVerify(token)
  if (!current?.id) throw new RotationError('current_invalid', 'A Cloudflare recusou o token atual (ou ele é um token de conta, ainda não suportado).')
  const res = await timedFetch(`${CF}/user/tokens/${encodeURIComponent(current.id)}/value`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  })
  const body = (await res.json().catch(() => ({}))) as { success?: boolean; result?: unknown }
  if (res.status === 403 || res.status === 401) throw new RotationError('permission', 'O token precisa da permissão "API Tokens: Edit" para gerar um novo valor.')
  if (!res.ok || !body.success || typeof body.result !== 'string') {
    throw new RotationError('platform_error', 'A Cloudflare recusou a rotação. Nada foi alterado.', 502)
  }
  // The roll invalidated the old value: from here on the new one MUST reach the user.
  const verified = Boolean(await cfVerify(body.result).catch(() => null))
  return { secret: body.result, expiresAt: current.expires_on ?? null, verified }
}

// ------------------------------------------------------------------ handler
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const authHeader = req.headers.get('Authorization') ?? ''
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } })
  const { data: userData } = await caller.auth.getUser()
  const user = userData.user
  if (!user) return json({ error: 'unauthorized' }, 401)

  let body: {
    action?: string
    connector?: string
    credential?: { id?: string; secret?: string }
    /** Login connectors: the admin credential from the vault item the user linked. */
    admin?: { id?: string; secret?: string }
    config?: Record<string, string>
    oldId?: string
    newKeyId?: string
  }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid request' }, 400)
  }
  const connector = body.connector as ConnectorId
  const action = body.action ?? 'rotate'
  const secret = String(body.credential?.secret ?? '')
  const id = String(body.credential?.id ?? '').trim()
  const adminCred = { id: String(body.admin?.id ?? '').trim(), secret: String(body.admin?.secret ?? '') }
  // The console connector does not need (and the app does not send) the current console password.
  const needsSecret = !ADMIN_LINKED.includes(connector)
  if (
    !CONNECTORS.includes(connector) || !['rotate', 'revoke_old'].includes(action) ||
    (needsSecret && !secret) || secret.length > 8192 || adminCred.secret.length > 8192
  ) {
    return json({ error: 'Pedido inválido.' }, 400)
  }

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { data: factors } = await admin.auth.admin.mfa.listFactors({ userId: user.id })
  if ((factors?.factors ?? []).some((f) => f.status === 'verified') && jwtClaims(authHeader).aal !== 'aal2') {
    return json({ error: 'Entre com a verificação em duas etapas para rotacionar.' }, 403)
  }
  const since = new Date(Date.now() - 3_600_000).toISOString()
  const { count } = await admin.from('audit_events').select('id', { count: 'exact', head: true })
    .eq('user_id', user.id).in('event', ['rotation.succeeded', 'rotation.failed']).gte('created_at', since)
  if ((count ?? 0) >= MAX_PER_HOUR) return json({ error: 'Muitas rotações na última hora. Tente mais tarde.' }, 429)

  // Audit: ids and outcome only, never values.
  const audit = (event: string, details: Record<string, unknown>) =>
    admin.from('audit_events').insert({ user_id: user.id, actor_id: user.id, event, source: 'server', target_type: 'connector', target_id: connector, details })

  try {
    const config = body.config ?? {}
    if (action === 'revoke_old') {
      if (!REVOCABLE.includes(connector)) return json({ error: 'Pedido inválido.' }, 400)
      const oldId = String(body.oldId ?? '')
      if (connector === 'aws-iam-access-key') await revokeOldAws({ id, secret }, oldId)
      else if (connector === 'gcp-service-account-key') await revokeOldGcpKey(secret, oldId)
      else await revokeOldEntraSecret(id, secret, config, oldId, String(body.newKeyId ?? ''))
      await audit('rotation.old_revoked', { connector })
      return json({ ok: true })
    }
    const result: Result =
      connector === 'aws-iam-access-key' ? await rotateAws({ id, secret })
      : connector === 'aws-iam-console' ? await rotateAwsConsole(id, adminCred)
      : connector === 'gcp-service-account-key' ? await rotateGcpKey(secret)
      : connector === 'entra-app-secret' ? await rotateEntraSecret(id, secret, config)
      : connector === 'entra-user' ? await rotateEntraUser(id, adminCred, config)
      : connector === 'google-workspace-user' ? await rotateWorkspaceUser(id, adminCred.secret, String(config.adminEmail ?? '').trim())
      : connector === 'gitlab-pat' ? await rotateGitlab(secret, config)
      : await rotateCloudflare(secret)
    await audit('rotation.succeeded', { connector, verified: result.verified })
    return json({ ok: true, ...result })
  } catch (error) {
    const e = error instanceof RotationError ? error : new RotationError('internal', 'Falha inesperada na rotação. Nada foi salvo; confira a plataforma antes de tentar de novo.', 500)
    // Requests refused by validation never reach a platform, so they do not count toward the limit.
    await audit(e.code === 'bad_input' ? 'rotation.rejected' : 'rotation.failed', { connector, code: e.code })
    return json({ error: e.message, code: e.code }, e.status)
  }
})
