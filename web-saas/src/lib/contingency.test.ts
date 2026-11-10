import { describe, expect, it } from 'vitest'
import { contingencyChecks } from './contingency'

const NOW = Date.parse('2026-11-06T12:00:00Z')
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString()
const base = { recoveryEnabled: true, recoveryTestedAt: daysAgo(10), mfaEnabled: true, lastExportAt: daysAgo(5), readerSavedAt: daysAgo(5), now: NOW }
const state = (r: ReturnType<typeof contingencyChecks>, id: string) => r.checks.find((c) => c.id === id)?.state

describe('contingencyChecks', () => {
  it('ready when recovery is on and tested, MFA is on and the export is recent', () => {
    const r = contingencyChecks(base)
    expect(r.ready).toBe(true)
    expect(r.checks.every((c) => c.state === 'ok')).toBe(true)
  })

  it('without a recovery key the user is not ready and the test step is not shown', () => {
    const r = contingencyChecks({ ...base, recoveryEnabled: false })
    expect(r.ready).toBe(false)
    expect(state(r, 'recovery')).toBe('missing')
    expect(state(r, 'recovery-test')).toBeUndefined()
  })

  it('an untested or old test, and an old or missing export, need attention', () => {
    expect(state(contingencyChecks({ ...base, recoveryTestedAt: null }), 'recovery-test')).toBe('warn')
    expect(state(contingencyChecks({ ...base, recoveryTestedAt: daysAgo(200) }), 'recovery-test')).toBe('warn')
    expect(state(contingencyChecks({ ...base, lastExportAt: daysAgo(100) }), 'export')).toBe('warn')
    expect(state(contingencyChecks({ ...base, lastExportAt: null }), 'export')).toBe('missing')
    expect(contingencyChecks({ ...base, lastExportAt: null }).ready).toBe(false)
  })

  it('the offline reader is recommended but does not block readiness', () => {
    const r = contingencyChecks({ ...base, readerSavedAt: null })
    expect(state(r, 'reader')).toBe('warn')
    expect(r.ready).toBe(true)
  })
})
