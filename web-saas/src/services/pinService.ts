/**
 * PIN unlock storage and server calls (see lib/crypto/pinCrypto.ts for the design).
 * The device keeps {deviceId, salt, wrapped DEK, expiry}; the server keeps the verifier hash and the
 * share, and counts wrong attempts. Nothing here is a secret on its own.
 */
import { fromBase64, toBase64 } from '../lib/crypto/encoding'
import { derivePinMaterial, unwrapDekWithPin, wrapDekWithPin } from '../lib/crypto'
import { supabase } from '../lib/supabase'

type PinRecord = { deviceId: string; salt: string; wrapped: string; expiresAt: string }
const key = (userId: string) => `sv.pin.${userId}`

export function readPinRecord(userId: string): PinRecord | null {
  try {
    const r = JSON.parse(localStorage.getItem(key(userId)) ?? 'null') as PinRecord | null
    if (!r || typeof r.deviceId !== 'string' || typeof r.wrapped !== 'string' || typeof r.salt !== 'string') return null
    if (Date.parse(r.expiresAt) <= Date.now()) {
      localStorage.removeItem(key(userId))
      return null
    }
    return r
  } catch {
    return null
  }
}

function forget(userId: string) {
  try {
    localStorage.removeItem(key(userId))
  } catch {
    /* nothing stored */
  }
}

/** Registers the PIN of this device. `dekRaw` is zeroed by the caller after this returns. */
export async function enablePin(userId: string, pin: string, dekRaw: Uint8Array<ArrayBuffer>): Promise<{ expiresAt: string }> {
  const deviceId = readPinRecord(userId)?.deviceId ?? crypto.randomUUID()
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const m = await derivePinMaterial(pin, salt)
  const { data: share, error } = await supabase.rpc('pin_register', { p_device: deviceId, p_verifier: m.verifier })
  if (error || typeof share !== 'string') throw new Error(error?.message ?? 'Não foi possível ativar o PIN.')
  const wrapped = await wrapDekWithPin(dekRaw, m.wrapPart, share, userId, deviceId)
  m.wrapPart.fill(0)
  const expiresAt = new Date(Date.now() + 14 * 86_400_000).toISOString()
  try {
    localStorage.setItem(key(userId), JSON.stringify({ deviceId, salt: toBase64(salt), wrapped, expiresAt } satisfies PinRecord))
  } catch {
    await supabase.rpc('pin_remove', { p_device: deviceId })
    throw new Error('Este navegador não permite guardar o PIN (janela anônima ou armazenamento bloqueado).')
  }
  return { expiresAt }
}

export type PinUnlockResult = { dek: CryptoKey } | { error: string; gone: boolean }

export async function unlockWithPin(userId: string, pin: string): Promise<PinUnlockResult> {
  const rec = readPinRecord(userId)
  if (!rec) return { error: 'O PIN deste aparelho expirou. Use a senha mestra.', gone: true }
  const m = await derivePinMaterial(pin, fromBase64(rec.salt))
  const { data, error } = await supabase.rpc('pin_unlock', { p_device: rec.deviceId, p_verifier: m.verifier })
  if (error) return { error: 'Não foi possível conferir o PIN agora. Tente de novo ou use a senha mestra.', gone: false }
  const r = data as { ok: boolean; share?: string; reason?: string; remaining?: number }
  if (r.ok && r.share) {
    try {
      const dek = await unwrapDekWithPin(rec.wrapped, m.wrapPart, r.share, userId, rec.deviceId)
      return { dek }
    } catch {
      forget(userId)
      return { error: 'O PIN deste aparelho não é mais válido. Use a senha mestra.', gone: true }
    } finally {
      m.wrapPart.fill(0)
    }
  }
  if (r.reason === 'wrong') return { error: `PIN incorreto. ${r.remaining} tentativa(s) antes de exigir a senha mestra.`, gone: false }
  forget(userId)
  return {
    error: r.reason === 'locked' ? 'PIN errado 5 vezes: o PIN foi desativado neste aparelho. Use a senha mestra.' : 'O PIN deste aparelho expirou. Use a senha mestra.',
    gone: true,
  }
}

/** Removes the PIN of this device, or of every device (`all`). */
export async function disablePin(userId: string, all = false) {
  const rec = readPinRecord(userId)
  forget(userId)
  if (all || rec) await supabase.rpc('pin_remove', { p_device: all ? null : rec!.deviceId })
}
