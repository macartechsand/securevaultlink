import { describe, expect, it } from 'vitest'
import { type PostureInput, computePosture, describeUserAgent } from './posture'

const perfect: PostureInput = {
  checkable: 10,
  weak: 0,
  reused: 0,
  exposed: 0,
  stale: 0,
  unsafeSites: 0,
  securityCheckRan: true,
  mfaEnabled: true,
  recoveryEnabled: true,
  sessions: 1,
  exposure: { itemShares: 1, itemSharesNoExpiry: 0, itemSharesEdit: 0, fileShares: 0, fileSharesNoExpiry: 0, activeTransfers: 0 },
}

describe('computePosture', () => {
  it('scores a perfect account at 100 with no recommendations', () => {
    const p = computePosture(perfect)
    expect(p.score).toBe(100)
    expect(p.grade).toBe('Excelente')
    expect(p.recommendations).toEqual([])
  })

  it('penalizes missing MFA and recovery with high/medium recommendations first', () => {
    const p = computePosture({ ...perfect, mfaEnabled: false, recoveryEnabled: false })
    expect(p.score).toBe(70)
    expect(p.recommendations.map((r) => r.id)).toEqual(['mfa', 'recovery'])
    expect(p.recommendations[0].severity).toBe('high')
  })

  it('weights exposed passwords more than weak ones and never goes negative', () => {
    const exposed = computePosture({ ...perfect, exposed: 2 }).score
    const weak = computePosture({ ...perfect, weak: 2 }).score
    expect(exposed).toBeLessThan(weak)
    const worst = computePosture({ ...perfect, weak: 10, reused: 10, exposed: 10, stale: 10, unsafeSites: 9, mfaEnabled: false, recoveryEnabled: false, sessions: 20 })
    expect(worst.score).toBeGreaterThanOrEqual(0)
    expect(worst.grade).toBe('Crítica')
    expect(worst.recommendations[0].severity).toBe('high')
  })

  it('accounts for sharing exposure, sessions and a missing security check', () => {
    const p = computePosture({
      ...perfect,
      securityCheckRan: false,
      sessions: 7,
      exposure: { ...perfect.exposure!, itemSharesNoExpiry: 2, fileSharesNoExpiry: 1 },
    })
    expect(p.recommendations.map((r) => r.id)).toEqual(expect.arrayContaining(['check', 'sessions', 'no-expiry']))
    expect(p.categories.find((c) => c.key === 'sharing')?.score).toBe(4)
    expect(p.categories.find((c) => c.key === 'sessions')?.score).toBe(1)
  })

  it('does not penalize an empty vault', () => {
    expect(computePosture({ ...perfect, checkable: 0 }).categories[0].score).toBe(40)
  })
})

describe('describeUserAgent', () => {
  it('recognizes common browsers and systems', () => {
    expect(describeUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0')).toBe('Edge · Windows')
    expect(describeUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1')).toBe('Safari · iOS')
    expect(describeUserAgent(null)).toBe('Dispositivo desconhecido')
  })
})
