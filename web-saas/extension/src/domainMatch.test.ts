import { describe, expect, it } from 'vitest'
import { matchItem, pageInfo, sameSite } from './domainMatch'

describe('matchItem', () => {
  it('matches the same host exactly, with or without www', () => {
    expect(matchItem('https://github.com', 'https://github.com/login')).toBe('exact')
    expect(matchItem('github.com', 'https://www.github.com/login')).toBe('exact')
  })

  it('matches subdomains of the same registrable domain', () => {
    expect(matchItem('https://banco.com.br', 'https://login.banco.com.br/entrar')).toBe('domain')
    expect(matchItem('https://conta.exemplo.co.uk', 'https://www.exemplo.co.uk')).toBe('domain')
  })

  it('rejects look-alike and suffix-trick domains', () => {
    expect(matchItem('https://banco.com.br', 'https://banco.com.br.evil.io/login')).toBe('none')
    expect(matchItem('https://banco.com.br', 'https://evil-banco.com.br')).toBe('none')
    expect(matchItem('https://banco.com.br', 'https://bancocom.br')).toBe('none')
    expect(matchItem('https://paypal.com', 'https://xn--pypal-4ve.com')).toBe('none')
    expect(matchItem('https://github.com', 'https://github.com@evil.io')).toBe('none')
  })

  it('treats public suffixes and hosting tenants as separate sites', () => {
    expect(matchItem('https://alice.github.io', 'https://mallory.github.io')).toBe('none')
    expect(matchItem('https://app.netlify.app', 'https://phish.netlify.app')).toBe('none')
    expect(matchItem('https://gov.br', 'https://evil.gov.br')).toBe('none')
  })

  it('never offers an https item on an http page', () => {
    expect(matchItem('https://github.com', 'http://github.com/login')).toBe('none')
    expect(matchItem('http://intranet.empresa.com.br', 'http://intranet.empresa.com.br')).toBe('exact')
  })

  it('requires the exact host and port for IPs and localhost', () => {
    expect(matchItem('http://localhost:3000', 'http://localhost:3000/login')).toBe('exact')
    expect(matchItem('http://localhost:3000', 'http://localhost:4000/login')).toBe('none')
    expect(matchItem('https://10.0.0.5', 'https://10.0.0.5/admin')).toBe('exact')
    expect(matchItem('https://10.0.0.5', 'https://10.0.0.6/admin')).toBe('none')
  })

  it('never matches non-web schemes, embedded credentials or empty URLs', () => {
    expect(matchItem('javascript:alert(1)', 'https://github.com')).toBe('none')
    expect(matchItem('https://github.com', 'chrome://settings')).toBe('none')
    expect(matchItem('https://github.com', 'https://user:pass@github.com')).toBe('none')
    expect(matchItem('', 'https://github.com')).toBe('none')
  })
})

describe('sameSite (frames that may receive a fill)', () => {
  it('accepts frames of the same registrable domain', () => {
    expect(sameSite('https://auth.exemplo.com/frame', 'https://www.exemplo.com')).toBe(true)
  })
  it('rejects third-party frames', () => {
    expect(sameSite('https://ads.tracker.net/frame', 'https://www.exemplo.com')).toBe(false)
    expect(sameSite('about:blank', 'https://www.exemplo.com')).toBe(false)
  })
})

describe('pageInfo', () => {
  it('flags exact-only hosts', () => {
    expect(pageInfo('http://localhost:5173')?.exactOnly).toBe(true)
    expect(pageInfo('https://www.exemplo.com.br')?.site).toBe('exemplo.com.br')
  })
})
