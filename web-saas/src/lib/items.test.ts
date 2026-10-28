import { describe, expect, it } from 'vitest'
import { LIMITS, emptyItem, matchesQuery, maskCard, normalizeItem, normalizeTags, passwordAgeDays, validateItem } from './items'

describe('normalizeItem', () => {
  it('upgrades a v1 entry to a login item with defaults', () => {
    const item = normalizeItem({ title: 'Banco', username: 'ana', password: 'x', url: 'banco.com', notes: '', category: 'Finance' })
    expect(item).toMatchObject({ type: 'login', title: 'Banco', category: 'Finance', tags: [], customFields: [], attachments: [], folderId: null })
  })

  it('clamps sizes and drops malformed parts', () => {
    const item = normalizeItem({
      type: 'nope',
      title: 'x'.repeat(500),
      notes: 'n'.repeat(5000),
      customFields: Array.from({ length: 15 }, (_, i) => ({ label: `L${i}`, value: 'v', hidden: i % 2 === 0 })),
      attachments: [{ fileId: 'a', name: 'f.pdf', size: 10 }, { name: 'missing id' }],
      tags: ['a', 'A', ' b ', 42],
    })
    expect(item.type).toBe('login')
    expect(item.title).toHaveLength(LIMITS.title)
    expect(item.notes).toHaveLength(LIMITS.notes)
    expect(item.customFields).toHaveLength(LIMITS.customFields)
    expect(item.attachments).toEqual([{ fileId: 'a', name: 'f.pdf', size: 10 }])
    expect(item.tags).toEqual(['a', 'b'])
  })

  it('normalizes tags case-insensitively and caps them', () => {
    expect(normalizeTags(['Prod', 'prod', '  ', 'Infra  team'])).toEqual(['Prod', 'Infra team'])
    expect(normalizeTags(Array.from({ length: 30 }, (_, i) => `t${i}`))).toHaveLength(LIMITS.tags)
  })
})

describe('validateItem', () => {
  it('validates per type', () => {
    expect(validateItem({ ...emptyItem('login'), title: '' })).toMatch(/título/)
    expect(validateItem({ ...emptyItem('login'), title: 'a' })).toMatch(/senha/)
    expect(validateItem({ ...emptyItem('note'), title: 'a' })).toMatch(/nota/)
    expect(validateItem({ ...emptyItem('note'), title: 'a', notes: 'texto' })).toBeNull()
    expect(validateItem({ ...emptyItem('secret'), title: 'a' })).toMatch(/segredo/)
    expect(validateItem({ ...emptyItem('card'), title: 'a', card: { holder: '', number: '123', expiry: '', cvv: '' } })).toMatch(/cartão/)
    expect(validateItem({ ...emptyItem('card'), title: 'a', card: { holder: '', number: '4111 1111 1111 1111', expiry: '13/30', cvv: '' } })).toMatch(/MM\/AA/)
    expect(validateItem({ ...emptyItem('card'), title: 'a', card: { holder: '', number: '4111111111111111', expiry: '12/30', cvv: '123' } })).toBeNull()
    expect(validateItem({ ...emptyItem('note'), title: 'a', notes: 'x', customFields: [{ id: '1', label: ' ', value: 'v', hidden: false }] })).toMatch(/campo/)
  })
})

describe('search and helpers', () => {
  const item = {
    ...emptyItem('login'),
    title: 'Servidor',
    tags: ['prod'],
    customFields: [
      { id: '1', label: 'Host', value: 'db.interno', hidden: false },
      { id: '2', label: 'PIN', value: '9876', hidden: true },
    ],
  }

  it('searches visible fields but never hidden values', () => {
    expect(matchesQuery(item, 'prod')).toBe(true)
    expect(matchesQuery(item, 'db.interno')).toBe(true)
    expect(matchesQuery(item, 'pin')).toBe(true)
    expect(matchesQuery(item, '9876')).toBe(false)
    expect(matchesQuery(item, '')).toBe(true)
  })

  it('masks card numbers and computes password age', () => {
    expect(maskCard('4111 1111 1111 1234')).toBe('•••• 1234')
    const now = Date.parse('2026-10-18T00:00:00Z')
    expect(passwordAgeDays({ ...item, passwordUpdatedAt: '2026-10-08T00:00:00Z' }, '2020-01-01T00:00:00Z', now)).toBe(10)
    expect(passwordAgeDays({ ...item, passwordUpdatedAt: null }, '2025-10-18T00:00:00Z', now)).toBe(365)
  })
})

describe('autoRotation (per-item consent)', () => {
  const consented = { connectorId: 'gitlab-pat', consentAt: '2026-10-28T10:00:00Z', config: { baseUrl: 'https://gitlab.com', expiresInDays: '90' } }

  it('keeps a valid opt-in on secrets', () => {
    const d = normalizeItem({ type: 'secret', title: 't', password: 'x', autoRotation: consented })
    expect(d.autoRotation).toEqual({ ...consented, lastRotatedAt: null, expiresAt: null })
  })

  it('drops it without consent, with an unknown connector, or on non-secret items', () => {
    expect(normalizeItem({ type: 'secret', autoRotation: { ...consented, consentAt: undefined } }).autoRotation).toBeNull()
    expect(normalizeItem({ type: 'secret', autoRotation: { ...consented, connectorId: 'evil' } }).autoRotation).toBeNull()
    expect(normalizeItem({ type: 'login', autoRotation: consented }).autoRotation).toBeNull()
    expect(emptyItem('secret').autoRotation).toBeNull()
  })
})
