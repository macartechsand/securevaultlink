/**
 * Content script (every http/https frame). Runs in the extension's isolated world: the page cannot
 * read its variables, but it lives in the page's process, so the background treats it as untrusted.
 *
 * It never receives saved passwords. It only:
 *  - asks the background whether to show the suggestions menu when a login field gets focus; the
 *    menu itself is an extension page in an iframe (the page cannot read or change its contents);
 *  - reads what the user typed when a login/sign-up form is sent and hands it to the background,
 *    which decides whether to offer saving (bar in another extension iframe);
 *  - tells the background that a page with a login form loaded (opt-in autofill, pending save bar).
 */
import { captureFrom, fieldKind, isUsernameLike, visiblePasswords } from './formLogic';
import type { ContentCommand, ContentRequest } from './protocol';

const MAX_Z = '2147483647';
const frames: Partial<Record<'inline' | 'save', HTMLIFrameElement>> = {};
let anchor: HTMLInputElement | null = null;
let rememberedUser = '';
let lastCapture = { key: '', at: 0 };

const ask = <T>(request: ContentRequest): Promise<T | null> =>
  chrome.runtime.sendMessage(request).then(
    (res: { ok: boolean; data?: T } | undefined) => (res?.ok ? (res.data ?? null) : null),
    () => null, // extension reloaded or worker unavailable: the page keeps working normally
  );

function styleFrame(el: HTMLIFrameElement, css: Record<string, string>) {
  const base: Record<string, string> = {
    all: 'initial',
    position: 'absolute',
    border: '0',
    'border-radius': '10px',
    'box-shadow': '0 8px 28px rgba(0,0,0,.28)',
    'z-index': MAX_Z,
    'color-scheme': 'normal',
    background: 'transparent',
    display: 'block',
    opacity: '1',
    transform: 'none',
    filter: 'none',
  };
  for (const [k, v] of Object.entries({ ...base, ...css })) el.style.setProperty(k, v, 'important');
}

function closeFrame(which: 'inline' | 'save') {
  frames[which]?.remove();
  delete frames[which];
  if (which === 'inline') anchor = null;
}

function placeInline() {
  const f = frames.inline;
  if (!f || !anchor) return;
  if (!anchor.isConnected) return closeFrame('inline');
  const r = anchor.getBoundingClientRect();
  const width = Math.min(340, Math.max(260, r.width));
  const left = Math.min(r.left, document.documentElement.clientWidth - width - 8);
  styleFrame(f, {
    top: `${r.bottom + window.scrollY + 4}px`,
    left: `${Math.max(8, left) + window.scrollX}px`,
    width: `${width}px`,
    height: f.style.getPropertyValue('height') || '120px',
  });
}

function openFrame(which: 'inline' | 'save', token: string) {
  closeFrame(which);
  const f = document.createElement('iframe');
  f.src = `${chrome.runtime.getURL(which === 'inline' ? 'inline.html' : 'save.html')}#${token}`;
  f.setAttribute('title', which === 'inline' ? 'SecureLink Vault: sugestões' : 'SecureLink Vault: salvar senha');
  f.setAttribute('aria-live', 'polite');
  frames[which] = f;
  if (which === 'inline') placeInline();
  else styleFrame(f, { position: 'fixed', top: '16px', right: '16px', width: '360px', height: '190px' });
  document.documentElement.appendChild(f);
}

/* ------------------------------------------------------------------ suggestions menu */

document.addEventListener(
  'focusin',
  (e) => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement) || el === anchor) return;
    const kind = fieldKind(el);
    if (!kind) return;
    void ask<{ token: string }>({ type: 'cs.focus', kind }).then((res) => {
      if (!res || document.activeElement !== el) return;
      anchor = el;
      openFrame('inline', res.token);
    });
  },
  true,
);

document.addEventListener(
  'mousedown',
  (e) => {
    // Clicks inside the iframe never reach the page; any other click outside the field closes the menu.
    if (frames.inline && e.target !== anchor) closeFrame('inline');
  },
  true,
);
document.addEventListener(
  'keydown',
  (e) => {
    if (e.key === 'Escape') closeFrame('inline');
  },
  true,
);
window.addEventListener('scroll', () => placeInline(), { passive: true, capture: true });
window.addEventListener('resize', () => placeInline(), { passive: true });

/* ------------------------------------------------------------------ save after submit */

document.addEventListener(
  'input',
  (e) => {
    const el = e.target;
    // Two-step logins: remember the user typed on the first screen of this page.
    if (el instanceof HTMLInputElement && el.type !== 'password' && isUsernameLike(el)) rememberedUser = el.value.slice(0, 256);
  },
  true,
);

function capture(origin: Element) {
  const got = captureFrom(origin, rememberedUser);
  if (!got) return;
  const key = `${got.username}\u0000${got.password.length}\u0000${got.password.slice(-2)}`;
  if (key === lastCapture.key && Date.now() - lastCapture.at < 3000) return;
  lastCapture = { key, at: Date.now() };
  void ask({ type: 'cs.captured', username: got.username, password: got.password });
}

document.addEventListener('submit', (e) => e.target instanceof Element && capture(e.target), true);
document.addEventListener(
  'click',
  (e) => {
    const target = e.target instanceof Element ? e.target : null;
    const button = target?.closest('button, input[type="submit"], input[type="button"], [role="button"]');
    if (button && visiblePasswords(button.closest('form') ?? document).some((p) => p.value)) capture(button);
  },
  true,
);
document.addEventListener(
  'keydown',
  (e) => {
    if (e.key === 'Enter' && e.target instanceof HTMLInputElement && (e.target.type === 'password' || e.target.form)) capture(e.target);
  },
  true,
);

/* ------------------------------------------------------------------ background commands */

chrome.runtime.onMessage.addListener((msg: ContentCommand, sender) => {
  if (sender.id !== chrome.runtime.id) return;
  if (msg.type === 'cs.close') closeFrame(msg.which);
  else if (msg.type === 'cs.showSave' && window === window.top) openFrame('save', msg.token);
  else if (msg.type === 'cs.resize') {
    const f = frames[msg.which];
    if (f) f.style.setProperty('height', `${Math.max(48, Math.min(msg.height, 420))}px`, 'important');
  }
});

// Top frame with a login form: lets the background run the opt-in autofill. (A pending save bar
// after a navigation is re-shown by the background on tabs.onUpdated, without a message per page.)
if (window === window.top) {
  const ready = () => {
    if (visiblePasswords(document).length) void ask({ type: 'cs.pageReady' });
  };
  if (document.readyState === 'complete') setTimeout(ready, 300);
  else window.addEventListener('load', () => setTimeout(ready, 300), { once: true });
}
