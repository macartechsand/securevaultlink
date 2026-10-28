// Microsoft Entra ID app registration client secrets (Microsoft Graph):
// token with the current secret → addPassword → verify (token with the NEW secret) → the app saves
// → revoke_old calls removePassword for the previous secret, authenticated with the new one.
import { GUID, RotationError, type Result, eventually, timedFetch } from './common.ts'

const GRAPH = 'https://graph.microsoft.com/v1.0'
const appUrl = (clientId: string) => `${GRAPH}/applications(appId='${clientId}')`

type Config = { tenantId?: string; expiresInDays?: string; keyId?: string }

function tenantOf(config: Config) {
  const t = (config.tenantId ?? '').trim()
  if (GUID.test(t) || /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(t)) return t
  throw new RotationError('bad_input', 'Informe o Directory (tenant) ID do Entra ID (GUID ou domínio, ex.: contoso.onmicrosoft.com).')
}

function clientIdOf(id: string) {
  if (GUID.test(id)) return id
  throw new RotationError('bad_input', 'Coloque o Application (client) ID do app em "Identificador".')
}

async function graphToken(tenant: string, clientId: string, secret: string) {
  const res = await timedFetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: secret, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
  })
  const body = (await res.json().catch(() => ({}))) as { access_token?: string }
  return res.ok && body.access_token ? body.access_token : null
}

const PERMISSION =
  'O app precisa da permissão de aplicativo Application.ReadWrite.OwnedBy no Microsoft Graph (com consentimento do administrador) e ser dono de si mesmo.'

export async function rotateEntraSecret(id: string, secret: string, config: Config): Promise<Result> {
  const clientId = clientIdOf(id)
  const tenant = tenantOf(config)
  const days = Number(config.expiresInDays || 180)
  if (!Number.isInteger(days) || days < 1 || days > 730) throw new RotationError('bad_input', 'Validade da nova secret: de 1 a 730 dias.')
  const token = await graphToken(tenant, clientId, secret)
  if (!token) throw new RotationError('current_invalid', 'O Entra ID recusou a secret atual (expirada, removida, tenant ou client ID incorretos).')
  const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }

  // Find the current secret's keyId. Graph exposes only its first 3 characters ("hint").
  let oldKeyId = GUID.test(config.keyId ?? '') ? config.keyId : undefined
  const app = await timedFetch(`${appUrl(clientId)}?$select=passwordCredentials`, { headers: auth })
  if (app.status === 403 || app.status === 401) throw new RotationError('permission', PERMISSION)
  if (app.status === 404) throw new RotationError('not_found', 'Aplicativo não encontrado no tenant informado.')
  if (!oldKeyId && app.ok) {
    const creds = ((await app.json().catch(() => ({}))) as { passwordCredentials?: { keyId: string; hint?: string }[] }).passwordCredentials ?? []
    const matches = creds.filter((c) => c.hint && c.hint === secret.slice(0, 3))
    if (matches.length === 1) oldKeyId = matches[0].keyId
  }

  const endDateTime = new Date(Date.now() + days * 86_400_000).toISOString()
  const res = await timedFetch(`${appUrl(clientId)}/addPassword`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ passwordCredential: { displayName: `SecureVault ${new Date().toISOString().slice(0, 10)}`, endDateTime } }),
  })
  if (res.status === 403 || res.status === 401) throw new RotationError('permission', PERMISSION)
  if (!res.ok) throw new RotationError('platform_error', `O Entra ID recusou a criação da secret (HTTP ${res.status}). Nada foi alterado.`, 502)
  const created = (await res.json().catch(() => ({}))) as { secretText?: string; keyId?: string; endDateTime?: string }
  if (!created.secretText || !created.keyId) throw new RotationError('platform_error', 'Resposta inesperada do Entra ID. Confira as secrets do app no portal.', 502)

  if (await eventually(async () => Boolean(await graphToken(tenant, clientId, created.secretText!)), 8, 2000, 4000)) {
    return {
      secret: created.secretText,
      keyId: created.keyId,
      expiresAt: created.endDateTime ?? endDateTime,
      revokeOldId: oldKeyId,
      verified: true,
      warning: oldKeyId ? undefined : 'A secret antiga não pôde ser identificada com segurança e continua ativa: remova-a no portal do Entra ID.',
    }
  }
  await timedFetch(`${appUrl(clientId)}/removePassword`, { method: 'POST', headers: auth, body: JSON.stringify({ keyId: created.keyId }) }).catch(() => null)
  throw new RotationError('verify_failed', 'A nova secret não pôde ser verificada e foi removida. A secret atual continua valendo.', 502)
}

export async function revokeOldEntraSecret(id: string, newSecret: string, config: Config, oldId: string, newKeyId: string) {
  const clientId = clientIdOf(id)
  if (!GUID.test(oldId) || oldId === newKeyId) throw new RotationError('bad_input', 'Secret antiga inválida.')
  const token = await graphToken(tenantOf(config), clientId, newSecret)
  const res = token
    ? await timedFetch(`${appUrl(clientId)}/removePassword`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ keyId: oldId }),
      })
    : null
  if (!res || (!res.ok && res.status !== 404)) {
    throw new RotationError('revoke_failed', 'Não foi possível remover a secret antiga. Remova-a no portal do Entra ID (Certificates & secrets).', 502)
  }
}
