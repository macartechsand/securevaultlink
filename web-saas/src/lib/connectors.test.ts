import { describe, expect, it } from 'vitest'
import { CONNECTORS, changePasswordUrl, connectorById } from './connectors'
import { AUTO_CONNECTOR_IDS, emptyItem, normalizeItem, rotationDueInDays } from './items'

describe('connectors', () => {
  it('builds the well-known change-password URL only for web addresses', () => {
    expect(changePasswordUrl('github.com')).toBe('https://github.com/.well-known/change-password')
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
    expect(CONNECTORS.filter((c) => c.status === 'available').map((c) => c.id)).toEqual(['web-assisted'])
    // One-click automatic connectors stay "beta" until validated against the real platforms.
    expect(CONNECTORS.filter((c) => c.status === 'beta').map((c) => c.id)).toEqual([...AUTO_CONNECTOR_IDS])
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
