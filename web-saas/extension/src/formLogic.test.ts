// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { captureFrom, fieldKind, usernameFor } from './formLogic'

beforeEach(() => {
  // jsdom has no layout: give every element a visible box.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 200, height: 30, top: 0, left: 0, right: 200, bottom: 30, x: 0, y: 0, toJSON: () => ({}) } as DOMRect)
})
afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

const $ = <T extends Element = HTMLInputElement>(sel: string) => document.querySelector(sel) as unknown as T
function type(sel: string, value: string) {
  $(sel).value = value
}

describe('fieldKind', () => {
  it('login form: user and password fields get the login menu', () => {
    document.body.innerHTML = `<form><input id="u" name="email" type="email"><input id="p" type="password"></form>`
    expect(fieldKind($('#u'))).toBe('login')
    expect(fieldKind($('#p'))).toBe('login')
  })

  it('sign-up form: password fields get the generator', () => {
    document.body.innerHTML = `<form><input id="u" type="email"><input id="p1" type="password"><input id="p2" type="password"></form>`
    expect(fieldKind($('#p1'))).toBe('new')
    document.body.innerHTML = `<form><input id="p" type="password" autocomplete="new-password"></form>`
    expect(fieldKind($('#p'))).toBe('new')
  })

  it('ignores search boxes and hidden fields', () => {
    document.body.innerHTML = `<form><input id="s" type="search"><input id="t" name="city"><input id="h" type="password" style="display:none"></form>`
    expect(fieldKind($('#s'))).toBeNull()
    expect(fieldKind($('#t'))).toBeNull()
    expect(fieldKind($('#h'))).toBeNull()
  })
})

describe('captureFrom', () => {
  it('login: username and password typed in the form', () => {
    document.body.innerHTML = `<form><input name="login" id="u"><input id="p" type="password"><button id="b">Entrar</button></form>`
    type('#u', ' ana@x.com ')
    type('#p', 'S3nh@Forte')
    expect(captureFrom($('#b'))).toEqual({ username: 'ana@x.com', password: 'S3nh@Forte' })
    expect(usernameFor($('#p'))?.id).toBe('u')
  })

  it('sign-up: takes the new password, not the confirmation order', () => {
    document.body.innerHTML = `<form><input type="email" id="u"><input id="p1" type="password"><input id="p2" type="password"><button id="b">Criar</button></form>`
    type('#u', 'ana@x.com')
    type('#p1', 'NovaSenha#1')
    type('#p2', 'NovaSenha#1')
    expect(captureFrom($('#b'))).toEqual({ username: 'ana@x.com', password: 'NovaSenha#1' })
  })

  it('change password: current, new, confirm -> the new one', () => {
    document.body.innerHTML = `<form><input id="c" type="password"><input id="n" type="password"><input id="r" type="password"><button id="b">Trocar</button></form>`
    type('#c', 'antiga123')
    type('#n', 'nova-senha-456')
    type('#r', 'nova-senha-456')
    expect(captureFrom($('#b'))?.password).toBe('nova-senha-456')
  })

  it('two-step login uses the user remembered from the first screen', () => {
    document.body.innerHTML = `<form><input id="p" type="password"><button id="b">Entrar</button></form>`
    type('#p', 'S3nh@Forte')
    expect(captureFrom($('#b'), 'ana@x.com')).toEqual({ username: 'ana@x.com', password: 'S3nh@Forte' })
  })

  it('nothing to capture without a typed password or with a too short one', () => {
    document.body.innerHTML = `<form><input id="u"><input id="p" type="password"><button id="b">Entrar</button></form>`
    expect(captureFrom($('#b'))).toBeNull()
    type('#p', 'abc')
    expect(captureFrom($('#b'))).toBeNull()
  })
})
