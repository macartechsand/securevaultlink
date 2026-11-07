/**
 * One-time codes (TOTP, RFC 6238) for logins of external systems. The secret lives inside the
 * encrypted item (field `otp`): a base32 secret or an otpauth://totp/... URI. Codes are computed on
 * the device with WebCrypto HMAC; nothing is sent anywhere.
 */

export type OtpParams = { secret: Uint8Array<ArrayBuffer>; digits: 6 | 7 | 8; period: number; algorithm: 'SHA-1' | 'SHA-256' | 'SHA-512'; issuer: string; account: string }

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Decode(value: string): Uint8Array<ArrayBuffer> {
  const clean = value.replace(/[\s-]/g, '').replace(/=+$/, '').toUpperCase()
  if (!clean || /[^A-Z2-7]/.test(clean)) throw new Error('Segredo OTP inválido (use o código em base32 ou o link otpauth://).')
  let bits = 0
  let acc = 0
  const out: number[] = []
  for (const ch of clean) {
    acc = ((acc << 5) | BASE32.indexOf(ch)) & 0xffff
    bits += 5
    if (bits >= 8) {
      out.push((acc >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return new Uint8Array(out)
}

/** Parses a base32 secret or an otpauth://totp/ URI. Throws a user-facing message if invalid. */
export function parseOtp(input: string): OtpParams {
  const text = input.trim()
  if (/^otpauth:/i.test(text)) {
    let url: URL
    try {
      url = new URL(text)
    } catch {
      throw new Error('Link otpauth:// inválido.')
    }
    if (url.host.toLowerCase() !== 'totp') throw new Error('Só códigos baseados em tempo (TOTP) são aceitos.')
    const q = url.searchParams
    const label = decodeURIComponent(url.pathname.replace(/^\//, ''))
    const [labelIssuer, labelAccount] = label.includes(':') ? label.split(/:(.*)/s) : ['', label]
    const algorithm = (q.get('algorithm') ?? 'SHA1').toUpperCase()
    const digits = Number(q.get('digits') ?? 6)
    const period = Number(q.get('period') ?? 30)
    if (!['SHA1', 'SHA256', 'SHA512'].includes(algorithm)) throw new Error('Algoritmo OTP não suportado.')
    if (![6, 7, 8].includes(digits)) throw new Error('Número de dígitos OTP não suportado.')
    if (!Number.isInteger(period) || period < 10 || period > 300) throw new Error('Período OTP inválido.')
    return {
      secret: base32Decode(q.get('secret') ?? ''),
      digits: digits as 6 | 7 | 8,
      period,
      algorithm: algorithm === 'SHA1' ? 'SHA-1' : algorithm === 'SHA256' ? 'SHA-256' : 'SHA-512',
      issuer: q.get('issuer') ?? labelIssuer ?? '',
      account: (labelAccount ?? '').trim(),
    }
  }
  return { secret: base32Decode(text), digits: 6, period: 30, algorithm: 'SHA-1', issuer: '', account: '' }
}

/** Code for a given moment (default: now) and the seconds left in its window. */
export async function totpCode(p: OtpParams, now = Date.now()): Promise<{ code: string; secondsLeft: number }> {
  const counter = Math.floor(now / 1000 / p.period)
  const msg = new Uint8Array(8)
  new DataView(msg.buffer).setBigUint64(0, BigInt(counter))
  const key = await crypto.subtle.importKey('raw', p.secret, { name: 'HMAC', hash: p.algorithm }, false, ['sign'])
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg))
  const offset = mac[mac.length - 1] & 0x0f
  const bin = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3]
  const code = String(bin % 10 ** p.digits).padStart(p.digits, '0')
  return { code, secondsLeft: p.period - (Math.floor(now / 1000) % p.period) }
}

/** True when the text is a usable OTP secret or URI. */
export function isValidOtp(input: string): boolean {
  try {
    return parseOtp(input).secret.length >= 10
  } catch {
    return false
  }
}
