import { describe, expect, it } from 'vitest'
import { decryptUsage, describeUsage, encryptUsage, relativeTime } from './usage'

const key = () => crypto.getRandomValues(new Uint8Array(32))
const NOW = Date.parse('2026-11-06T12:00:00Z')

describe('usage records', () => {
  it('round-trips only with the same item key, item and user', async () => {
    const k = key()
    const rec = { at: new Date(NOW).toISOString(), action: 'filled' as const, host: 'github.com', client: 'extension' as const, device: 'Edge · Windows' }
    const row = await encryptUsage(k, 'item-1', 'user-1', rec)
    expect(row.ciphertext).not.toContain('github')
    expect(await decryptUsage(k, 'item-1', 'user-1', row)).toEqual(rec)
    expect(await decryptUsage(key(), 'item-1', 'user-1', row)).toBeNull()
    expect(await decryptUsage(k, 'item-2', 'user-1', row)).toBeNull()
    expect(await decryptUsage(k, 'item-1', 'user-2', row)).toBeNull()
  })

  it('describes the last use in plain words', () => {
    expect(relativeTime(new Date(NOW - 30_000).toISOString(), NOW)).toBe('agora há pouco')
    expect(relativeTime(new Date(NOW - 5 * 60_000).toISOString(), NOW)).toBe('há 5 min')
    expect(relativeTime(new Date(NOW - 3 * 3_600_000).toISOString(), NOW)).toBe('há 3 h')
    expect(relativeTime(new Date(NOW - 86_400_000).toISOString(), NOW)).toBe('há 1 dia')
    const text = describeUsage({ at: new Date(NOW - 7_200_000).toISOString(), action: 'filled', host: 'github.com', client: 'extension', device: 'Edge · Windows' }, NOW)
    expect(text).toBe('preenchida em github.com há 2 h · extensão (Edge · Windows)')
  })
})
