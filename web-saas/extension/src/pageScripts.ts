/**
 * Functions injected with chrome.scripting.executeScript. They run in the extension's isolated
 * world of the page (page scripts cannot read their variables) and must be self-contained:
 * no imports, no closures over module scope.
 */

export type FrameScan = { href: string; passwords: number; users: number; top: boolean };

/** Step 1 (no secrets involved): reports which frames have visible login fields. */
export function scanLoginFields(): FrameScan {
  const visible = (el: HTMLInputElement) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 4 && r.height > 4 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.1 && !el.disabled && !el.readOnly;
  };
  const inputs = [...document.querySelectorAll('input')] as HTMLInputElement[];
  const passwords = inputs.filter((i) => i.type === 'password' && visible(i)).length;
  const users = inputs.filter(
    (i) => (['text', 'email', 'tel', ''].includes(i.type) || i.autocomplete === 'username') && visible(i),
  ).length;
  return { href: location.href, passwords, users, top: window === window.top };
}

/** Step 2: writes the chosen credential into the visible login fields of this frame only. */
export function fillLoginFields(username: string, password: string): { username: boolean; password: boolean } {
  const visible = (el: HTMLInputElement) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 4 && r.height > 4 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.1 && !el.disabled && !el.readOnly;
  };
  const setValue = (el: HTMLInputElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    el.focus();
    if (setter) setter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const isUserField = (i: HTMLInputElement) =>
    (['text', 'email', 'tel', ''].includes(i.type) || i.autocomplete === 'username') && visible(i);

  const inputs = [...document.querySelectorAll('input')] as HTMLInputElement[];
  const passwords = inputs.filter((i) => i.type === 'password' && visible(i));
  const active = document.activeElement instanceof HTMLInputElement ? document.activeElement : null;
  const pw =
    (active && passwords.includes(active) ? active : null) ??
    passwords.find((p) => p.autocomplete === 'current-password') ??
    passwords[0] ??
    null;

  let user: HTMLInputElement | null = null;
  const scope = pw ? [...(pw.form ? pw.form.querySelectorAll('input') : document.querySelectorAll('input'))] as HTMLInputElement[] : inputs;
  const candidates = scope.filter(isUserField);
  if (pw) {
    // The last username-like field before the password field, in document order.
    const before = candidates.filter((c) => c.compareDocumentPosition(pw) & Node.DOCUMENT_POSITION_FOLLOWING);
    user = candidates.find((c) => c.autocomplete === 'username') ?? before[before.length - 1] ?? null;
  } else {
    // Multi-step logins (user first, password on the next screen).
    user = candidates.find((c) => c.autocomplete === 'username') ?? candidates.find((c) => c.type === 'email') ?? candidates[0] ?? null;
  }

  const filled = { username: false, password: false };
  if (user && username) {
    setValue(user, username);
    filled.username = true;
  }
  if (pw && password) {
    setValue(pw, password);
    filled.password = true;
  }
  return filled;
}
