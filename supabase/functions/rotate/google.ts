// Google Cloud service account keys: create → verify (OAuth token with the NEW key) → the app saves
// → revoke_old deletes the previous key, authenticated with the new key. Undo on failed verification.
import { RotationError, type Result, eventually, timedFetch } from './common.ts'

type SaKey = { type?: string; client_email?: string; private_key?: string; private_key_id?: string }
type ValidKey = { client_email: string; private_key: string; private_key_id: string }

// Fixed endpoints: the token_uri inside the JSON is ignored (it could point anywhere).
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const IAM = 'https://iam.googleapis.com/v1/projects/-/serviceAccounts'
const KEY_ID = /^[a-f0-9]{40}$/

const b64url = (bytes: Uint8Array) => {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const utf8 = (s: string) => new TextEncoder().encode(s)
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

export function parseServiceAccountKey(raw: string): ValidKey {
  let k: SaKey
  try {
    k = JSON.parse(raw)
  } catch {
    throw new RotationError('bad_input', 'Cole em "Valor do segredo" o arquivo JSON completo da chave da service account.')
  }
  if (
    k?.type !== 'service_account' ||
    !/^[^@\s/]+@[a-z0-9.-]+\.gserviceaccount\.com$/.test(k.client_email ?? '') ||
    !KEY_ID.test(k.private_key_id ?? '') ||
    !/-----BEGIN PRIVATE KEY-----/.test(k.private_key ?? '')
  ) {
    throw new RotationError('bad_input', 'O JSON não parece uma chave de service account do Google Cloud (type, client_email, private_key_id, private_key).')
  }
  return k as ValidKey
}

async function accessToken(k: ValidKey): Promise<string | null> {
  let key: CryptoKey
  try {
    const der = fromB64(k.private_key.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, ''))
    key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  } catch {
    throw new RotationError('bad_input', 'A chave privada do JSON é inválida.')
  }
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(utf8(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: k.private_key_id })))
  const claims = b64url(utf8(JSON.stringify({ iss: k.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform', aud: TOKEN_URL, iat: now, exp: now + 600 })))
  const signature = b64url(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, utf8(`${header}.${claims}`))))
  const res = await timedFetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claims}.${signature}` }),
  })
  const body = (await res.json().catch(() => ({}))) as { access_token?: string }
  return res.ok && body.access_token ? body.access_token : null
}

const keyUrl = (email: string, id = '') => `${IAM}/${encodeURIComponent(email)}/keys${id ? `/${id}` : ''}`

export async function rotateGcpKey(raw: string): Promise<Result> {
  const current = parseServiceAccountKey(raw)
  const token = await accessToken(current)
  if (!token) throw new RotationError('current_invalid', 'O Google recusou a chave atual (desativada, removida ou incorreta).')

  const res = await timedFetch(keyUrl(current.client_email), {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ privateKeyType: 'TYPE_GOOGLE_CREDENTIALS_FILE', keyAlgorithm: 'KEY_ALG_RSA_2048' }),
  })
  if (!res.ok) {
    const text = await res.text()
    if (/disableServiceAccountKeyCreation|constraints\//.test(text)) {
      throw new RotationError('org_policy', 'A política da organização bloqueia a criação de chaves (iam.disableServiceAccountKeyCreation).')
    }
    if (res.status === 403) {
      throw new RotationError('permission', 'A service account precisa das permissões iam.serviceAccountKeys.create e .delete nela mesma (papel "Service Account Key Admin").')
    }
    if (/FAILED_PRECONDITION|limit/i.test(text)) throw new RotationError('key_limit', 'A service account atingiu o limite de 10 chaves. Remova chaves sem uso no console.')
    throw new RotationError('platform_error', `O Google recusou a criação da chave (HTTP ${res.status}). Nada foi alterado.`, 502)
  }
  const created = (await res.json().catch(() => ({}))) as { privateKeyData?: string }
  let nextRaw: string
  let next: ValidKey
  try {
    nextRaw = new TextDecoder().decode(fromB64(created.privateKeyData ?? ''))
    next = parseServiceAccountKey(nextRaw)
  } catch {
    throw new RotationError('platform_error', 'Resposta inesperada do Google. Confira as chaves da service account no console.', 502)
  }

  // New keys can take up to a minute to be accepted.
  if (await eventually(async () => Boolean(await accessToken(next)), 10, 2000, 4000)) {
    return { secret: nextRaw, keyId: next.private_key_id, revokeOldId: current.private_key_id, verified: true }
  }
  await timedFetch(keyUrl(current.client_email, next.private_key_id), { method: 'DELETE', headers: { authorization: `Bearer ${token}` } }).catch(() => null)
  throw new RotationError('verify_failed', 'A nova chave não pôde ser verificada e foi removida. A chave atual continua valendo.', 502)
}

export async function revokeOldGcpKey(newRaw: string, oldId: string) {
  const next = parseServiceAccountKey(newRaw)
  if (!KEY_ID.test(oldId) || oldId === next.private_key_id) throw new RotationError('bad_input', 'Chave antiga inválida.')
  const token = await accessToken(next)
  const res = token ? await timedFetch(keyUrl(next.client_email, oldId), { method: 'DELETE', headers: { authorization: `Bearer ${token}` } }) : null
  if (!res || (!res.ok && res.status !== 404)) {
    throw new RotationError('revoke_failed', `Não foi possível remover a chave antiga ${oldId}. Remova-a no console do Google Cloud.`, 502)
  }
}
