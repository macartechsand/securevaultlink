import { describe, expect, it } from 'vitest'
import { scrubMessage } from './errorReporter'

describe('scrubMessage', () => {
  it('removes emails, tokens, ids and long numbers', () => {
    const msg = scrubMessage(
      'Failed for ana@example.com token eyJhbGciOi.eyJzdWIiOi.c2lnbmF0dXJl key sb_publishable_ABCDEFGHIJKLMNOPQRSTUVWXYZ id 11111111-2222-3333-4444-555555555555 card 4111111111111111',
    )
    expect(msg).not.toMatch(/ana@example\.com|eyJ|ABCDEFGHIJ|11111111-2222|4111111111111111/)
    expect(msg).toContain('<email>')
    expect(msg).toContain('<jwt>')
    expect(msg).toContain('<id>')
  })

  it('truncates long messages', () => {
    expect(scrubMessage('erro '.repeat(100)).length).toBeLessThanOrEqual(200)
  })
})
