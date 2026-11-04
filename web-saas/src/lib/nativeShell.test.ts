import { describe, expect, it } from 'vitest'
import { NATIVE_AUTH_REDIRECT, isNativeShell, nativeAuthCode } from './nativeShell'

describe('native shell', () => {
  it('is false outside the app', () => {
    expect(isNativeShell()).toBe(false)
  })

  it('accepts only our deep link and a well-formed PKCE code', () => {
    expect(nativeAuthCode(`${NATIVE_AUTH_REDIRECT}?code=3f6b2c1e-aaaa-bbbb-cccc-1234567890ab`)).toEqual({ code: '3f6b2c1e-aaaa-bbbb-cccc-1234567890ab' })
    expect(nativeAuthCode('https://evil.example/?code=12345678')).toBeNull()
    expect(nativeAuthCode('other.app://auth-callback?code=12345678')).toBeNull()
    expect(nativeAuthCode(`${NATIVE_AUTH_REDIRECT}-evil?code=12345678`)).toBeNull()
    expect(nativeAuthCode(`${NATIVE_AUTH_REDIRECT}?code=<script>`)).toEqual({ error: expect.stringMatching(/código/) })
    expect(nativeAuthCode(`${NATIVE_AUTH_REDIRECT}`)).toEqual({ error: expect.stringMatching(/código/) })
  })

  it('surfaces provider errors', () => {
    expect(nativeAuthCode(`${NATIVE_AUTH_REDIRECT}?error=access_denied&error_description=User+denied`)).toEqual({ error: 'User denied' })
  })
})
