import { describe, expect, it } from 'vitest'
import { buildEvidenceCsv, csvCell } from './evidenceReport'
import { computeItemHealth } from './itemHealth'
import { emptyItem } from './items'
import { computeDeadlines } from './rotationDeadlines'
import type { VaultItem } from '../state/itemOps'

const NOW = Date.parse('2026-11-10T12:00:00Z')
const DAY = 86_400_000
const mk = (id: string, title: string, over: Partial<VaultItem['data']> = {}, access: VaultItem['access'] = 'owner'): VaultItem => ({
  id,
  ownerId: 'u1',
  version: 2,
  data: { ...emptyItem('login'), title, password: 'Correct-Horse-Battery-77!x', url: 'https://bank.example', notes: 'alpha-note', passwordUpdatedAt: new Date(NOW - 40 * DAY).toISOString(), ...over },
  createdAt: new Date(NOW - 400 * DAY).toISOString(),
  updatedAt: new Date(NOW - 40 * DAY).toISOString(),
  access,
  sharedWith: [],
})

describe('evidence report', () => {
  const items = [
    mk('11111111-1111-1111-1111-111111111111', 'Banco', { rotationIntervalDays: 90 }),
    mk('22222222-2222-2222-2222-222222222222', '=HYPERLINK("x")'),
    mk('33333333-3333-3333-3333-333333333333', 'Só leitura', {}, 'view'),
  ]
  const health = computeItemHealth(items, new Map(), new Map(), NOW)
  const deadlines = computeDeadlines(items, {}, NOW)
  const events = [
    { event: 'rotation.failed', createdAt: '2026-11-01T10:00:00Z', details: { item: items[0].id } },
    { event: 'rotation.succeeded', createdAt: '2026-11-02T10:00:00Z', details: { item: items[0].id, verified: true } },
  ]

  it('one row per own or editable item, no secrets, URLs or notes', () => {
    const csv = buildEvidenceCsv({ items, health, deadlines, events, account: 'ana@example.com', pseudonymize: false, now: NOW })
    expect(csv).not.toMatch(/Correct-Horse|bank\.example|alpha-note/)
    const rows = csv.trim().split('\r\n').filter((l) => !l.startsWith('#'))
    expect(rows).toHaveLength(3) // header + 2 items (view-only excluded)
    const bank = rows.find((r) => r.startsWith('Banco'))!
    expect(bank).toContain('2026-11-02')
    expect(bank).toContain('sucesso')
    expect(bank.endsWith(',sim')).toBe(true)
  })

  it('neutralizes spreadsheet formulas and can replace titles by codes', () => {
    const csv = buildEvidenceCsv({ items, health, deadlines, events, account: 'a', pseudonymize: false, now: NOW })
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`)
    const coded = buildEvidenceCsv({ items, health, deadlines, events, account: 'a', pseudonymize: true, now: NOW })
    expect(coded).not.toContain('Banco')
    expect(coded).toContain('ITEM-001')
  })

  it('csvCell quotes separators and guards every formula prefix', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('+1')).toBe("'+1")
    expect(csvCell('-1')).toBe("'-1")
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(csvCell(null)).toBe('')
  })
})
