/**
 * PIN unlock (per device), designed so that neither the device nor the server alone can open the vault:
 *
 *   PIN --PBKDF2-SHA256 (600k, salt kept ONLY on this device)--> base
 *   base --HKDF "verifier"--> verifier (sent to the server, which stores only its SHA-256)
 *   base --HKDF "wrap"--> wrapPart
 *   wrapPart || share (random 32 bytes held by the server) --HKDF "kek"--> KEK (AES-256-GCM)
 *   KEK wraps the vault DEK; the wrapped DEK is kept ONLY on this device.
 *
 * The server releases `share` only for the right verifier, with at most 5 wrong tries (then it deletes
 * the registration), so a stolen device cannot be brute-forced offline. A server breach alone has no
 * salt and no wrapped DEK. Registrations expire after 14 days; the master password is needed again.
 */
import { fromBase64, toBase64 } from './encoding'

export const PIN_MIN_LENGTH = 6
export const PIN_MAX_LENGTH = 12
const PIN_KDF_ITERATIONS = 600_000

const enc = new TextEncoder()
const subtle = () => globalThis.crypto.subtle

/** Returns a problem description, or null when the PIN is acceptable. */
export function validatePin(pin: string): string | null {
  if (!/^\d+$/.test(pin)) return 'Use só números no PIN.'
  if (pin.length < PIN_MIN_LENGTH || pin.length > PIN_MAX_LENGTH) return `O PIN deve ter de ${PIN_MIN_LENGTH} a ${PIN_MAX_LENGTH} dígitos.`
  if (/^(\d)\1+$/.test(pin)) return 'Não use o mesmo dígito repetido.'
  const digits = [...pin].map(Number)
  const step = digits[1] - digits[0]
  if (Math.abs(step) === 1 && digits.every((d, i) => i === 0 || d - digits[i - 1] === step)) return 'Não use sequências como 123456.'
  return null
}

async function hkdf(ikm: Uint8Array<ArrayBuffer>, info: string, length = 32): Promise<Uint8Array<ArrayBuffer>> {
  const key = await subtle().importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  const bits = await subtle().deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: enc.encode(info) }, key, length * 8)
  return new Uint8Array(bits)
}

export type PinMaterial = { verifier: string; wrapPart: Uint8Array<ArrayBuffer> }

export async function derivePinMaterial(pin: string, salt: Uint8Array<ArrayBuffer>): Promise<PinMaterial> {
  const material = await subtle().importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits'])
  const base = new Uint8Array(
    await subtle().deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PIN_KDF_ITERATIONS }, material, 256),
  )
  const verifier = toBase64(await hkdf(base, 'securevault:pin:verifier:v1'))
  const wrapPart = await hkdf(base, 'securevault:pin:wrap:v1')
  base.fill(0)
  return { verifier, wrapPart }
}

async function pinKek(wrapPart: Uint8Array<ArrayBuffer>, share: string): Promise<CryptoKey> {
  const shareBytes = fromBase64(share)
  const ikm = new Uint8Array(wrapPart.length + shareBytes.length)
  ikm.set(wrapPart)
  ikm.set(shareBytes, wrapPart.length)
  const raw = await hkdf(ikm, 'securevault:pin:kek:v1')
  ikm.fill(0)
  const key = await subtle().importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  raw.fill(0)
  return key
}

const aad = (userId: string, deviceId: string) => enc.encode(`securevault:pin-wrap:v1:${userId}:${deviceId}`)

/** Wraps the raw DEK for this device. Returns base64 iv||ciphertext. */
export async function wrapDekWithPin(
  dekRaw: Uint8Array<ArrayBuffer>,
  wrapPart: Uint8Array<ArrayBuffer>,
  share: string,
  userId: string,
  deviceId: string,
): Promise<string> {
  const kek = await pinKek(wrapPart, share)
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: aad(userId, deviceId) }, kek, dekRaw))
  const out = new Uint8Array(12 + ct.length)
  out.set(iv)
  out.set(ct, 12)
  return toBase64(out)
}

/** Unwraps the DEK as a non-extractable key. Throws if anything does not match. */
export async function unwrapDekWithPin(
  wrapped: string,
  wrapPart: Uint8Array<ArrayBuffer>,
  share: string,
  userId: string,
  deviceId: string,
): Promise<CryptoKey> {
  const kek = await pinKek(wrapPart, share)
  const data = fromBase64(wrapped)
  const raw = new Uint8Array(
    await subtle().decrypt({ name: 'AES-GCM', iv: data.slice(0, 12), additionalData: aad(userId, deviceId) }, kek, data.slice(12)),
  )
  const dek = await subtle().importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  raw.fill(0)
  return dek
}
