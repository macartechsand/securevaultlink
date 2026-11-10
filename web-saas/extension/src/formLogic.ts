/**
 * Login-form detection used by the content script (content.ts). DOM only, no extension APIs, so it
 * can be unit-tested with jsdom. Imported ONLY by content.ts: the content script must stay a single
 * classic script without shared chunks.
 */

export function isVisibleInput(el: HTMLInputElement): boolean {
  if (el.disabled || el.readOnly) return false
  const r = el.getBoundingClientRect()
  const s = getComputedStyle(el)
  return r.width > 4 && r.height > 4 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity || '1') > 0.1
}

const USER_TYPES = ['text', 'email', 'tel', '']

export function isUsernameLike(el: HTMLInputElement): boolean {
  if (el.autocomplete === 'username' || el.type === 'email') return true
  if (!USER_TYPES.includes(el.type)) return false
  const hint = `${el.name} ${el.id} ${el.autocomplete} ${el.getAttribute('aria-label') ?? ''} ${el.placeholder}`.toLowerCase()
  return /user|login|email|e-mail|mail|conta|usu[aá]rio|cpf|account|identifier/.test(hint)
}

export const isNewPasswordField = (el: HTMLInputElement) => el.autocomplete === 'new-password'

const scopeOf = (el: Element): ParentNode => el.closest('form') ?? el.ownerDocument

export function visiblePasswords(scope: ParentNode): HTMLInputElement[] {
  return ([...scope.querySelectorAll('input[type="password"]')] as HTMLInputElement[]).filter(isVisibleInput)
}

/** Which inline menu a focused field gets: logins to fill, a password generator, or none. */
export function fieldKind(el: HTMLInputElement): 'login' | 'new' | null {
  if (!isVisibleInput(el)) return null
  const passwords = visiblePasswords(scopeOf(el))
  if (el.type === 'password') {
    if (isNewPasswordField(el)) return 'new'
    // Two or more password fields without hints: sign-up or change form.
    if (passwords.length >= 2 && el.autocomplete !== 'current-password') return 'new'
    return 'login'
  }
  if (isUsernameLike(el) && (passwords.length > 0 || el.autocomplete === 'username')) return 'login'
  return null
}

/** The username field that goes with a password field: autocomplete=username, else the last one before it. */
export function usernameFor(pw: HTMLInputElement): HTMLInputElement | null {
  const inputs = ([...scopeOf(pw).querySelectorAll('input')] as HTMLInputElement[]).filter(
    (i) => i !== pw && i.type !== 'password' && USER_TYPES.concat('email').includes(i.type) && isVisibleInput(i),
  )
  const marked = inputs.find((i) => i.autocomplete === 'username')
  if (marked) return marked
  const before = inputs.filter((i) => i.compareDocumentPosition(pw) & Node.DOCUMENT_POSITION_FOLLOWING)
  return before.filter(isUsernameLike).pop() ?? before.pop() ?? null
}

export type Captured = { username: string; password: string }

/**
 * Reads what the user typed when a form is sent. For sign-up and change-password forms the NEW
 * password is taken (autocomplete=new-password, or the last field that is not current-password).
 * `rememberedUser` covers two-step logins (user on one screen, password on the next).
 */
export function captureFrom(origin: Element, rememberedUser = ''): Captured | null {
  const passwords = visiblePasswords(scopeOf(origin)).filter((p) => p.value)
  if (!passwords.length) return null
  const fresh = passwords.filter((p) => isNewPasswordField(p))
  const notCurrent = passwords.filter((p) => p.autocomplete !== 'current-password')
  // [new, confirm] or [current, new, confirm]: the new one is the second to last that is not current.
  const pw = fresh[0] ?? (notCurrent.length >= 2 ? notCurrent[notCurrent.length - 2] : (notCurrent[0] ?? passwords[0]))
  const password = pw.value
  if (password.length < 4 || password.length > 512) return null
  const user = usernameFor(passwords[0])
  const username = (user?.value ?? '').trim() || rememberedUser.trim()
  return { username: username.slice(0, 256), password }
}
