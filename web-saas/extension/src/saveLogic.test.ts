import { describe, expect, it } from 'vitest'
import { decideSave, newToken, siteHash, type SaveCandidate } from './saveLogic'

const c = (id: string, username: string, password: string, access: SaveCandidate['access'] = 'owner'): SaveCandidate => ({ id, username, password, access })

describe('decideSave', () => {
  it('offers a new login when nothing matches the username', () => {
    expect(decideSave([], 'ana@x.com', 'S3nh@')).toEqual({ mode: 'new' })
    expect(decideSave([c('1', 'bia@x.com', 'a')], 'ana@x.com', 'S3nh@')).toEqual({ mode: 'new' })
  })

  it('offers nothing when the same username and password are already saved (case-insensitive user)', () => {
    expect(decideSave([c('1', 'Ana@X.com ', 'S3nh@')], 'ana@x.com', 'S3nh@')).toBeNull()
  })

  it('offers an update of the existing login when the password changed', () => {
    expect(decideSave([c('1', 'ana@x.com', 'old')], 'ana@x.com', 'new')).toEqual({ mode: 'update', itemId: '1' })
  })

  it('never updates or duplicates a login shared with me as view-only', () => {
    expect(decideSave([c('1', 'ana@x.com', 'old', 'view')], 'ana@x.com', 'new')).toBeNull()
  })

  it('without a username, updates only when exactly one editable login matches', () => {
    expect(decideSave([c('1', 'ana', 'old')], '', 'new')).toEqual({ mode: 'update', itemId: '1' })
    expect(decideSave([c('1', 'ana', 'old'), c('2', 'bia', 'x')], '', 'new')).toEqual({ mode: 'new' })
    expect(decideSave([c('1', 'ana', 'same')], '', 'same')).toBeNull()
  })

  it('refuses empty and oversized values', () => {
    expect(decideSave([], 'ana', '')).toBeNull()
    expect(decideSave([], 'ana', 'x'.repeat(513))).toBeNull()
    expect(decideSave([], 'a'.repeat(257), 'x')).toBeNull()
  })
})

describe('tokens and site hashes', () => {
  it('tokens are random and URL-safe', () => {
    const a = newToken()
    expect(a).toMatch(/^[A-Za-z0-9_-]{24}$/)
    expect(newToken()).not.toBe(a)
  })

  it('site hashes are stable and do not contain the site', async () => {
    const h = await siteHash('example.com')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(await siteHash('example.com')).toBe(h)
    expect(await siteHash('example.org')).not.toBe(h)
  })
})
