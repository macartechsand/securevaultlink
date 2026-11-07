/**
 * "Where and when was this password last used" (Premium). The record is encrypted on the device with
 * the item's own key, so the server stores only an opaque blob plus the time it was written:
 * the site where it was filled and the device stay unreadable to SecureLink.
 */
import { fromBase64, toBase64 } from './crypto/encoding'

export type UsageAction = 'filled' | 'copied' | 'otp'
export type UsageClient = 'web' | 'app' | 'extension'
export type UsageRecord = { at: string; action: UsageAction; host: string; client: UsageClient; device: string }

const enc = new TextEncoder()
const dec = new TextDecoder()
const aad = (itemId: string, userId: string) => enc.encode(`securevault:usage:v1:${itemId}:${userId}`)
const importKey = (raw: Uint8Array<ArrayBuffer>) => crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])

export async function encryptUsage(itemKey: Uint8Array<ArrayBuffer>, itemId: string, userId: string, rec: UsageRecord) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(itemId, userId) }, await importKey(itemKey), enc.encode(JSON.stringify(rec)))
  return { ciphertext: toBase64(new Uint8Array(ct)), iv: toBase64(iv) }
}

export async function decryptUsage(
  itemKey: Uint8Array<ArrayBuffer>,
  itemId: string,
  userId: string,
  row: { ciphertext: string; iv: string },
): Promise<UsageRecord | null> {
  try {
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(row.iv), additionalData: aad(itemId, userId) },
      await importKey(itemKey),
      fromBase64(row.ciphertext),
    )
    const r = JSON.parse(dec.decode(pt)) as Partial<UsageRecord>
    if (typeof r.at !== 'string') return null
    return {
      at: r.at,
      action: r.action === 'filled' || r.action === 'otp' ? r.action : 'copied',
      host: typeof r.host === 'string' ? r.host.slice(0, 253) : '',
      client: r.client === 'extension' || r.client === 'app' ? r.client : 'web',
      device: typeof r.device === 'string' ? r.device.slice(0, 80) : '',
    }
  } catch {
    return null
  }
}

/** "há 5 min", "há 3 h", "há 2 dias", or a date. */
export function relativeTime(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
  if (s < 60) return 'agora há pouco'
  if (s < 3600) return `há ${Math.floor(s / 60)} min`
  if (s < 86_400) return `há ${Math.floor(s / 3600)} h`
  if (s < 30 * 86_400) return `há ${Math.floor(s / 86_400)} dia${s < 2 * 86_400 ? '' : 's'}`
  return new Date(iso).toLocaleDateString('pt-BR')
}

const ACTION = { filled: 'preenchida', copied: 'copiada', otp: 'código usado' } as const
const CLIENT = { web: 'app web', app: 'app', extension: 'extensão' } as const

/** "preenchida em github.com há 2 h · extensão (Edge · Windows)". */
export function describeUsage(r: UsageRecord, now = Date.now()): string {
  const where = r.host ? ` em ${r.host}` : ''
  const device = r.device ? ` (${r.device})` : ''
  return `${ACTION[r.action]}${where} ${relativeTime(r.at, now)} · ${CLIENT[r.client]}${device}`
}
