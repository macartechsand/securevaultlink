import { describe, expect, it } from 'vitest'
import { CONNECTORS, changePasswordUrl, connectorById } from './connectors'
import { AUTO_CONNECTOR_IDS, emptyItem, normalizeItem, rotationDueInDays } from './items'

describe('connectors', () => {
  it('builds the well-known change-password URL only for web addresses', () => {
    expect(changePasswordUrl('github.com')).toBe('https://github.com/.well-known/change-password')
    // Platforms without a password API: direct password pages.
    expect(changePasswordUrl('https://www.instagram.com/')).toBe('https://accountscenter.instagram.com/password_and_security/')
    expect(changePasswordUrl('facebook.com')).toBe('https://accountscenter.facebook.com/password_and_security/')
    expect(changePasswordUrl('accounts.google.com')).toBe('https://myaccount.google.com/signinoptions/password')
    expect(changePasswordUrl('outlook.com')).toBe('https://account.live.com/password/Change')
    expect(changePasswordUrl('notfacebook.com.evil.example')).toBe('https://notfacebook.com.evil.example/.well-known/change-password')
    expect(changePasswordUrl('https://contas.banco.com.br/login?x=1')).toBe('https://contas.banco.com.br/.well-known/change-password')
    expect(changePasswordUrl('javascript:alert(1)')).toBeNull()
    expect(changePasswordUrl('')).toBeNull()
  })

  it('has unique ids, sane policies and only the assisted connector marked available', () => {
    const ids = new Set(CONNECTORS.map((c) => c.id))
    expect(ids.size).toBe(CONNECTORS.length)
    for (const c of CONNECTORS) {
      expect(c.policy.minLength).toBeGreaterThanOrEqual(12)
      expect(c.policy.maxLength).toBeGreaterThanOrEqual(c.policy.minLength)
      expect(c.requires.length).toBeGreaterThan(0)
    }
    // Only assisted connectors are "available"; automatic ones stay beta until validated on the real platforms.
    expect(CONNECTORS.filter((c) => c.status === 'available').every((c) => c.executor === 'assisted')).toBe(true)
    // One-click automatic connectors stay "beta" until validated against the real platforms.
    expect(CONNECTORS.filter((c) => c.status === 'beta').map((c) => c.id).sort()).toEqual([...AUTO_CONNECTOR_IDS].sort())
    // Targets inside private networks must run on an agent.
    expect(CONNECTORS.filter((c) => c.category === 'database').every((c) => c.executor === 'agent')).toBe(true)
    expect(connectorById('nope')).toBeUndefined()
  })
})

describe('scheduled rotation', () => {
  const now = Date.parse('2026-10-19T00:00:00Z')

  it('computes days until due and tolerates bad stored values', () => {
    const base = { ...emptyItem('login'), password: 'x', passwordUpdatedAt: '2026-09-19T00:00:00Z' }
    expect(rotationDueInDays({ ...base, rotationIntervalDays: 0 }, '2026-01-01T00:00:00Z', now)).toBeNull()
    expect(rotationDueInDays({ ...base, rotationIntervalDays: 90 }, '2026-01-01T00:00:00Z', now)).toBe(60)
    expect(rotationDueInDays({ ...base, rotationIntervalDays: 7 }, '2026-01-01T00:00:00Z', now)).toBe(-23)
    expect(normalizeItem({ rotationIntervalDays: -5 }).rotationIntervalDays).toBe(0)
    expect(normalizeItem({ rotationIntervalDays: 'x' }).rotationIntervalDays).toBe(0)
    expect(normalizeItem({ rotationIntervalDays: 90 }).rotationIntervalDays).toBe(90)
  })
})
