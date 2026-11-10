/**
 * Just-in-time access with approval (docs/product/innovation.md 9.1), client-side cryptography.
 * Everything the server stores about a JIT access is either public (ids, minutes, dates, e-mails) or
 * sealed to one person's ECDH public key:
 *  - the LABEL (title, user, site) is sealed to the eligible person, so they know what they may ask for;
 *  - the JUSTIFICATION is sealed to the owner;
 *  - the ITEM KEY is sealed to the requester only when the owner approves (sealItemKeyForRecipient).
 */
import { openSealedKey, sealKeyForRecipient } from './crypto/fileCrypto'

const enc = new TextEncoder()
const dec = new TextDecoder()

export type JitLabel = { title: string; username: string; host: string }

export const JIT_DURATIONS = [15, 30, 60, 120, 240, 480] as const
export const JIT_REASON_MIN = 20

const labelInfo = (itemId: string, memberId: string) => enc.encode(`securevault:jit-label:v1:${itemId}:${memberId}`)
const reasonInfo = (eligibilityId: string, ownerId: string) => enc.encode(`securevault:jit-reason:v1:${eligibilityId}:${ownerId}`)

const hostOf = (url: string) => {
  try {
    return url ? new URL(/^https?:/i.test(url) ? url : `https://${url}`).hostname : ''
  } catch {
    return ''
  }
}

export function sealJitLabel(memberPublicKey: string, itemId: string, memberId: string, item: { title: string; username: string; url: string }) {
  const label: JitLabel = { title: item.title.slice(0, 120), username: item.username.slice(0, 120), host: hostOf(item.url).slice(0, 120) }
  return sealKeyForRecipient(memberPublicKey, enc.encode(JSON.stringify(label)), labelInfo(itemId, memberId))
}

export async function openJitLabel(privateKey: CryptoKey, ownPublicKey: string, sealed: string, itemId: string, memberId: string): Promise<JitLabel> {
  const raw = await openSealedKey(privateKey, ownPublicKey, sealed, labelInfo(itemId, memberId), 'Access label')
  const l = JSON.parse(dec.decode(raw)) as Partial<JitLabel>
  return { title: String(l.title ?? ''), username: String(l.username ?? ''), host: String(l.host ?? '') }
}

/** Validates and seals the justification to the owner. */
export async function sealJitReason(ownerPublicKey: string, eligibilityId: string, ownerId: string, reason: string) {
  const text = reason.trim()
  if (text.length < JIT_REASON_MIN) throw new Error(`Explique o motivo do acesso (pelo menos ${JIT_REASON_MIN} caracteres).`)
  return sealKeyForRecipient(ownerPublicKey, enc.encode(text.slice(0, 1000)), reasonInfo(eligibilityId, ownerId))
}

export async function openJitReason(privateKey: CryptoKey, ownPublicKey: string, sealed: string, eligibilityId: string, ownerId: string) {
  return dec.decode(await openSealedKey(privateKey, ownPublicKey, sealed, reasonInfo(eligibilityId, ownerId), 'Justification'))
}

export type JitStatus = 'pending' | 'active' | 'expired' | 'denied' | 'revoked' | 'cancelled'

/** Status as the user sees it: an approved access past its deadline is "expired". */
export function jitStatus(r: { status: string; expires_at: string | null }, now = Date.now()): JitStatus {
  if (r.status === 'approved') return r.expires_at && Date.parse(r.expires_at) > now ? 'active' : 'expired'
  return (['pending', 'denied', 'revoked', 'cancelled'] as const).find((s) => s === r.status) ?? 'expired'
}

export const JIT_STATUS_LABEL: Record<JitStatus, string> = {
  pending: 'Aguardando aprovação',
  active: 'Ativo',
  expired: 'Encerrado (prazo)',
  denied: 'Recusado',
  revoked: 'Encerrado pelo dono',
  cancelled: 'Cancelado',
}

export const durationLabel = (minutes: number) => (minutes < 60 ? `${minutes} min` : `${minutes / 60} h`)
