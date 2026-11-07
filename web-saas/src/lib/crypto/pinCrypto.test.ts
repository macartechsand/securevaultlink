import { describe, expect, it } from 'vitest'
import { toBase64 } from './encoding'
import { derivePinMaterial, unwrapDekWithPin, validatePin, wrapDekWithPin } from './pinCrypto'

const rand = (n: number) => crypto.getRandomValues(new Uint8Array(n))

describe('pin crypto', () => {
  it('validates PINs: digits only, 6-12, no repeats or sequences', () => {
    expect(validatePin('482915')).toBeNull()
    expect(validatePin('12a456')).toMatch(/números/)
    expect(validatePin('48291')).toMatch(/6 a 12/)
    expect(validatePin('000000')).toMatch(/repetido/)
    expect(validatePin('123456')).toMatch(/sequências/)
    expect(validatePin('987654')).toMatch(/sequências/)
  })

  it('round-trips the DEK only with the right PIN, share, user and device', async () => {
    const dekRaw = rand(32)
    const salt = rand(16)
    const share = toBase64(rand(32))
    const m = await derivePinMaterial('482915', salt)
    expect(m.verifier).toHaveLength(44)
    const wrapped = await wrapDekWithPin(dekRaw, m.wrapPart, share, 'user-1', 'dev-1')

    const dek = await unwrapDekWithPin(wrapped, m.wrapPart, share, 'user-1', 'dev-1')
    expect(dek.extractable).toBe(false)
    // Same DEK: encrypt with the original raw key, decrypt with the unwrapped one.
    const original = await crypto.subtle.importKey('raw', dekRaw, 'AES-GCM', false, ['encrypt'])
    const iv = rand(12)
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, original, new TextEncoder().encode('alpha'))
    expect(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, dek, ct))).toBe('alpha')

    const wrong = await derivePinMaterial('482916', salt)
    expect(wrong.verifier).not.toBe(m.verifier)
    await expect(unwrapDekWithPin(wrapped, wrong.wrapPart, share, 'user-1', 'dev-1')).rejects.toThrow()
    await expect(unwrapDekWithPin(wrapped, m.wrapPart, toBase64(rand(32)), 'user-1', 'dev-1')).rejects.toThrow()
    await expect(unwrapDekWithPin(wrapped, m.wrapPart, share, 'user-2', 'dev-1')).rejects.toThrow()
    await expect(unwrapDekWithPin(wrapped, m.wrapPart, share, 'user-1', 'dev-2')).rejects.toThrow()
  })

  it('the same PIN with another salt gives another verifier (the server cannot precompute PINs)', async () => {
    const a = await derivePinMaterial('482915', rand(16))
    const b = await derivePinMaterial('482915', rand(16))
    expect(a.verifier).not.toBe(b.verifier)
  })
})
