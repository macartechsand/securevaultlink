import { describe, expect, it } from 'vitest'
import { base32Decode, isValidOtp, parseOtp, totpCode } from './totp'

// RFC 6238 appendix B: ASCII "12345678901234567890" (SHA-1), 32 bytes (SHA-256), 64 bytes (SHA-512), 8 digits.
const ascii = (s: string) => new TextEncoder().encode(s)
const SHA1 = ascii('12345678901234567890')
const SHA256 = ascii('12345678901234567890123456789012')
const SHA512 = ascii('1234567890123456789012345678901234567890123456789012345678901234')
const vectors: [number, string, string, string][] = [
  [59, '94287082', '46119246', '90693936'],
  [1111111109, '07081804', '68084774', '25091201'],
  [1234567890, '89005924', '91819424', '93441116'],
  [20000000000, '65353130', '77737706', '47863826'],
]

describe('totp', () => {
  it('matches the RFC 6238 test vectors for SHA-1, SHA-256 and SHA-512', async () => {
    for (const [t, s1, s256, s512] of vectors) {
      const at = t * 1000
      expect((await totpCode({ secret: SHA1, digits: 8, period: 30, algorithm: 'SHA-1', issuer: '', account: '' }, at)).code).toBe(s1)
      expect((await totpCode({ secret: SHA256, digits: 8, period: 30, algorithm: 'SHA-256', issuer: '', account: '' }, at)).code).toBe(s256)
      expect((await totpCode({ secret: SHA512, digits: 8, period: 30, algorithm: 'SHA-512', issuer: '', account: '' }, at)).code).toBe(s512)
    }
  })

  it('parses a plain base32 secret (spaces, lower case) with the usual defaults', async () => {
    // "12345678901234567890" in base32.
    const p = parseOtp('gezd gnbv gy3t qojq gezd gnbv gy3t qojq')
    expect(p).toMatchObject({ digits: 6, period: 30, algorithm: 'SHA-1' })
    expect(Array.from(p.secret)).toEqual(Array.from(SHA1))
    const { code, secondsLeft } = await totpCode(p, 59_000)
    expect(code).toBe('287082')
    expect(secondsLeft).toBe(1)
  })

  it('parses otpauth URIs with issuer, account and parameters', () => {
    const p = parseOtp('otpauth://totp/GitHub:ana%40example.com?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=GitHub&digits=8&period=60&algorithm=SHA256')
    expect(p).toMatchObject({ issuer: 'GitHub', account: 'ana@example.com', digits: 8, period: 60, algorithm: 'SHA-256' })
  })

  it('rejects invalid input with a readable message', () => {
    expect(() => base32Decode('not base32!')).toThrow(/inválido/)
    expect(() => parseOtp('otpauth://hotp/x?secret=GEZDGNBV')).toThrow(/TOTP/)
    expect(() => parseOtp('otpauth://totp/x?secret=GEZDGNBVGY3TQOJQ&digits=9')).toThrow(/dígitos/)
    expect(isValidOtp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')).toBe(true)
    expect(isValidOtp('ABC')).toBe(false)
    expect(isValidOtp('')).toBe(false)
  })
})
