import { describe, expect, it, vi } from 'vitest'
import { analyzeHealth, passwordStrength } from './health/passwordHealth'
import { checkPwned, parseRange, sha1Hex } from './health/pwned'
import { generatePassword, randomInt } from './passwordGenerator'
import { analyzeUrl, normalizeUrl, safeHref } from './urlCheck'

describe('passwordGenerator', () => {
  it('respects length and includes every selected set', () => {
    for (let i = 0; i < 200; i++) {
      const pw = generatePassword({ length: 12, uppercase: true, numbers: true, symbols: true })
      expect(pw).toHaveLength(12)
      expect(pw).toMatch(/[a-z]/)
      expect(pw).toMatch(/[A-Z]/)
      expect(pw).toMatch(/[0-9]/)
      expect(pw).toMatch(/[^A-Za-z0-9]/)
    }
  })

  it('omits unselected sets', () => {
    const pw = generatePassword({ length: 64, uppercase: false, numbers: false, symbols: false })
    expect(pw).toMatch(/^[a-z]+$/)
  })

  it('randomInt is in range and roughly uniform', () => {
    const counts = new Array(6).fill(0)
    for (let i = 0; i < 6000; i++) counts[randomInt(6)]++
    for (const c of counts) expect(c).toBeGreaterThan(800)
    expect(() => randomInt(0)).toThrow()
  })

  it('does not use Math.random', () => {
    const spy = vi.spyOn(Math, 'random')
    generatePassword({ length: 20, uppercase: true, numbers: true, symbols: true })
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('passwordHealth', () => {
  it('rates weak and strong passwords', () => {
    expect(passwordStrength('password')).toBe('Weak')
    expect(passwordStrength('123456')).toBe('Weak')
    expect(passwordStrength('')).toBe('Weak')
    expect(passwordStrength('vK9#mQ2$zL7@pR4!xT8')).toBe('Strong')
  })

  it('finds reused passwords and groups them', () => {
    const report = analyzeHealth([
      { id: 'a', title: 'A', username: 'u', password: 'vK9#mQ2$zL7@pR4!xT8' },
      { id: 'b', title: 'B', username: 'u', password: 'vK9#mQ2$zL7@pR4!xT8' },
      { id: 'c', title: 'C', username: 'u', password: 'password' },
      { id: 'd', title: 'D', username: 'u', password: 'uniQue-Long-Passphrase-93!' },
    ])
    expect(report.total).toBe(4)
    expect(report.reusedGroups).toEqual([['a', 'b']])
    expect(report.reused.sort()).toEqual(['a', 'b'])
    expect(report.weak).toContain('c')
    expect(report.weak).not.toContain('d')
  })
})

describe('pwned', () => {
  it('computes the known SHA-1 of "password"', async () => {
    expect(await sha1Hex('password')).toBe('5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8')
  })

  it('parses ranges and ignores padding', () => {
    const map = parseRange('ABC:5\r\nDEF:0\r\nbad line\r\n123:2')
    expect(map.get('ABC')).toBe(5)
    expect(map.has('DEF')).toBe(false)
    expect(map.get('123')).toBe(2)
  })

  it('sends only the 5-char prefix and finds the suffix', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe('https://api.pwnedpasswords.com/range/5BAA6')
      return new Response('1E4C9B93F3F0682250B6CF8331B7EE68FD8:9545824\r\nAAAAA:0', { status: 200 })
    })
    const result = await checkPwned('password', fetchMock as unknown as typeof fetch)
    expect(result).toEqual({ status: 'ok', count: 9545824 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reports not found as count 0 and failures as error (never "safe")', async () => {
    const empty = vi.fn(async () => new Response('AAAAA:3', { status: 200 }))
    expect(await checkPwned('x-unlikely-pw', empty as unknown as typeof fetch)).toEqual({ status: 'ok', count: 0 })
    const down = vi.fn(async () => new Response('', { status: 503 }))
    expect(await checkPwned('x', down as unknown as typeof fetch)).toEqual({ status: 'error' })
    const boom = vi.fn(async () => {
      throw new Error('network')
    })
    expect(await checkPwned('x', boom as unknown as typeof fetch)).toEqual({ status: 'error' })
  })
})

describe('urlCheck', () => {
  it('only allows http(s) hrefs', () => {
    expect(safeHref('javascript:alert(1)')).toBeUndefined()
    expect(safeHref('data:text/html,<script>')).toBeUndefined()
    expect(safeHref('JaVaScRiPt:alert(1)')).toBeUndefined()
    expect(safeHref('example.com')).toBe('https://example.com/')
    expect(safeHref('example.com:8080/x')).toBe('https://example.com:8080/x')
    expect(safeHref('http://example.com')).toBe('http://example.com/')
    expect(normalizeUrl('')).toBeNull()
  })

  it('flags suspicious URLs', () => {
    const codes = (u: string) => analyzeUrl(u).findings.map((f) => f.code)
    expect(codes('http://192.168.1.1/login')).toEqual(expect.arrayContaining(['no-https', 'ip-host']))
    expect(codes('https://xn--pple-43d.com')).toContain('punycode')
    expect(codes('https://user:pw@example.com')).toContain('credentials-in-url')
    expect(codes('https://a.b.c.d.e.example.com')).toContain('many-subdomains')
    expect(codes('javascript:alert(1)')).toContain('bad-scheme')
    expect(analyzeUrl('https://example.com').findings).toEqual([])
  })
})
