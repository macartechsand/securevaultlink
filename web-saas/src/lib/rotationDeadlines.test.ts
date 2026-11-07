import { describe, expect, it } from 'vitest'
import type { RiskFlag } from './itemHealth'
import { emptyItem } from './items'
import { DAY_MS, computeDeadlines, deadlineLabel, notificationText, summarizeDeadlines, updateRiskSince } from './rotationDeadlines'
import type { VaultItem } from '../state/itemOps'

const NOW = Date.parse('2026-11-05T12:00:00Z')
const iso = (t: number) => new Date(t).toISOString()

function item(id: string, over: Partial<VaultItem['data']> = {}, access: VaultItem['access'] = 'owner'): VaultItem {
  return {
    id,
    ownerId: 'u1',
    version: 2,
    data: { ...emptyItem('login'), title: id, password: 'x', passwordUpdatedAt: iso(NOW - 10 * DAY_MS), ...over },
    createdAt: iso(NOW - 100 * DAY_MS),
    updatedAt: iso(NOW - 10 * DAY_MS),
    access,
    sharedWith: [],
  }
}
const risks = (entries: [string, RiskFlag[]][]) => new Map(entries)

describe('updateRiskSince', () => {
  it('records new risks now and keeps the first date of risks still present', () => {
    const items = [item('a'), item('b')]
    const prev = { a: { weak: iso(NOW - 5 * DAY_MS) } }
    const next = updateRiskSince(prev, items, risks([['a', ['weak', 'reused']], ['b', ['exposed']]]), true, NOW)
    expect(next.a).toEqual({ weak: iso(NOW - 5 * DAY_MS), reused: iso(NOW) })
    expect(next.b).toEqual({ exposed: iso(NOW) })
  })

  it('forgets fixed risks and items that no longer exist', () => {
    const next = updateRiskSince({ a: { weak: iso(NOW) }, gone: { weak: iso(NOW) } }, [item('a')], risks([['a', []]]), true, NOW)
    expect(next).toEqual({})
  })

  it('keeps breach findings while the check has not run, until the password changes', () => {
    const found = iso(NOW - 3 * DAY_MS)
    const kept = updateRiskSince({ a: { exposed: found } }, [item('a')], risks([['a', []]]), false, NOW)
    expect(kept.a).toEqual({ exposed: found })
    const changed = item('a', { passwordUpdatedAt: iso(NOW - DAY_MS) })
    expect(updateRiskSince({ a: { exposed: found } }, [changed], risks([['a', []]]), false, NOW)).toEqual({})
  })

  it('a risk found before the last password change counts again from now', () => {
    const old = iso(NOW - 40 * DAY_MS)
    const next = updateRiskSince({ a: { weak: old } }, [item('a')], risks([['a', ['weak']]]), true, NOW)
    expect(next.a?.weak).toBe(iso(NOW))
  })
})

describe('computeDeadlines', () => {
  it('7 days for exposed, 30 for weak, soonest first, overdue negative', () => {
    const since = { a: { weak: iso(NOW - 31 * DAY_MS) }, b: { exposed: iso(NOW - 2 * DAY_MS) } }
    const [first, second] = computeDeadlines([item('b'), item('a')], since, NOW)
    expect(first.item.id).toBe('a')
    expect(first.daysLeft).toBe(-1)
    expect(second.item.id).toBe('b')
    expect(second.daysLeft).toBe(5)
    expect(second.reasons).toEqual(['exposed'])
  })

  it('an old password alone gets no deadline (NIST SP 800-63B-4: no forced periodic changes)', () => {
    const since = { a: { stale: iso(NOW - 400 * DAY_MS) } }
    expect(computeDeadlines([item('a')], since, NOW)).toEqual([])
    const mixed = computeDeadlines([item('a')], { a: { stale: iso(NOW - 400 * DAY_MS), weak: iso(NOW) } }, NOW)
    expect(mixed[0].reasons).toEqual(['weak'])
  })

  it('includes scheduled rotations due within 7 days and skips view-only items', () => {
    const scheduled = item('s', { rotationIntervalDays: 15 })
    const far = item('f', { rotationIntervalDays: 90 })
    const viewOnly = item('v', {}, 'view')
    const out = computeDeadlines([scheduled, far, viewOnly], { v: { exposed: iso(NOW) } }, NOW)
    expect(out.map((d) => [d.item.id, d.daysLeft, d.reasons])).toEqual([['s', 5, ['due']]])
  })

  it('summary, labels and a notification text without names', () => {
    const since = { alpha: { exposed: iso(NOW - 8 * DAY_MS) }, beta: { weak: iso(NOW - 28 * DAY_MS) }, gamma: { weak: iso(NOW) } }
    const summary = summarizeDeadlines(computeDeadlines([item('alpha'), item('beta'), item('gamma')], since, NOW))
    expect(summary).toMatchObject({ overdue: 1, soon: 1 })
    const text = notificationText(summary)!
    expect(text).toContain('1 troca de senha vencida')
    expect(text).not.toMatch(/alpha|beta|gamma/)
    expect(notificationText({ overdue: 0, soon: 0, next: null })).toBeNull()
    expect([deadlineLabel(-2), deadlineLabel(0), deadlineLabel(1)]).toEqual(['venceu há 2 dias', 'vence hoje', 'vence em 1 dia'])
  })
})
