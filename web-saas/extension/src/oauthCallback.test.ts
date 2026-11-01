import { describe, expect, it } from 'vitest'
import { oauthCodeFrom } from './oauthCallback'

const REDIRECT = 'https://mcljapeloopnadipmhmojkmbjjgbpdij.chromiumapp.org/'

describe('oauthCodeFrom', () => {
  it('returns the PKCE code from our own redirect', () => {
    expect(oauthCodeFrom(`${REDIRECT}?code=3f6b2c1e-aaaa-bbbb-cccc-1234567890ab`, REDIRECT)).toBe('3f6b2c1e-aaaa-bbbb-cccc-1234567890ab')
  })

  it('rejects a redirect to another extension or site', () => {
    expect(() => oauthCodeFrom('https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/?code=12345678', REDIRECT)).toThrow(/origem/)
    expect(() => oauthCodeFrom('https://evil.example/?code=12345678', REDIRECT)).toThrow(/origem/)
  })

  it('surfaces provider errors and cancellations', () => {
    expect(() => oauthCodeFrom(`${REDIRECT}?error=access_denied&error_description=User+denied+access`, REDIRECT)).toThrow('User denied access')
    expect(() => oauthCodeFrom(`${REDIRECT}#error_description=Signups+not+allowed`, REDIRECT)).toThrow('Signups not allowed')
    expect(() => oauthCodeFrom(undefined, REDIRECT)).toThrow(/cancelado/)
  })

  it('rejects a missing or malformed code', () => {
    expect(() => oauthCodeFrom(REDIRECT, REDIRECT)).toThrow(/código/)
    expect(() => oauthCodeFrom(`${REDIRECT}?code=<script>`, REDIRECT)).toThrow(/código/)
  })
})
