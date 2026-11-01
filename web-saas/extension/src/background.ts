/**
 * Background service worker: the only place that holds vault keys and decrypted items.
 *
 * - Keys and items live in memory. The raw DEK is also kept in chrome.storage.session (RAM only,
 *   readable by extension pages but not by content scripts) so a service-worker restart does not
 *   ask for the master password again. It is wiped on lock, browser close and after IDLE_MINUTES.
 * - Pages never talk to this worker. Only the popup (an extension page) can send requests.
 * - A fill is a two-step injection: scan frames without secrets, then send the credential to one
 *   frame of the same site as the tab, in the same document that was scanned.
 */
import { unlockWithPassword } from '../../src/lib/crypto';
import { fromBase64, toBase64 } from '../../src/lib/crypto/encoding';
import { friendlyError } from '../../src/lib/messages';
import { type OAuthProvider, OAUTH_PROVIDERS, fetchEnabledProviders, oauthOptions } from '../../src/lib/oauthProviders';
import { logClientEvent } from '../../src/services/auditService';
import { ensureUserKeyPair } from '../../src/services/fileService';
import { fetchProfile } from '../../src/services/vaultService';
import { loadItems, type VaultItem } from '../../src/state/itemOps';
import { matchItem, sameSite } from './domainMatch';
import { oauthCodeFrom } from './oauthCallback';
import { type FrameScan, fillLoginFields, scanLoginFields } from './pageScripts';
import type { FillResponse, ItemSummary, Request, Response, StatusResponse } from './protocol';
import { supabase } from './supabase';

const IDLE_MINUTES = 10;
const SESSION_KEYS = ['dek', 'userId', 'lastActivity'] as const;

let dek: CryptoKey | null = null;
let userId: string | null = null;
let items: VaultItem[] | null = null;
let loading: Promise<VaultItem[]> | null = null;
let failedUnlocks = 0;

/* ------------------------------------------------------------------ session lifecycle */

async function restore() {
  const saved = await chrome.storage.session.get([...SESSION_KEYS]);
  if (!saved.dek || !saved.userId) return;
  if (Date.now() - Number(saved.lastActivity ?? 0) > IDLE_MINUTES * 60_000) {
    await lock('idle');
    return;
  }
  dek = await crypto.subtle.importKey('raw', fromBase64(saved.dek as string), { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  userId = saved.userId as string;
}

const ready = restore().catch(() => lock('restore-failed'));

async function touch() {
  if (dek) await chrome.storage.session.set({ lastActivity: Date.now() });
}

async function lock(reason: string) {
  const wasUnlocked = Boolean(dek);
  dek = null;
  userId = null;
  items = null;
  loading = null;
  await chrome.storage.session.remove([...SESSION_KEYS]);
  if (wasUnlocked) logClientEvent('vault.locked', undefined, { client: 'extension', reason });
}

async function status(): Promise<StatusResponse> {
  const { authError } = await chrome.storage.session.get('authError');
  if (authError) await chrome.storage.session.remove('authError');
  const base = { idleMinutes: IDLE_MINUTES, ...(authError ? { authError: String(authError) } : {}) };
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    if (dek) await lock('signed-out');
    return { ...base, status: 'signed-out', email: null };
  }
  const email = data.session.user.email ?? null;
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') return { ...base, status: 'needs-mfa', email };
  if (dek && userId === data.session.user.id) return { ...base, status: 'unlocked', email };
  if (dek) await lock('user-changed');
  const profile = await fetchProfile();
  return { ...base, status: profile ? 'locked' : 'needs-setup', email };
}

async function signIn(email: string, password: string) {
  await lock('sign-in');
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(error.message);
}

/**
 * Google/GitHub through Supabase (Authorization Code + PKCE). The provider window returns to this
 * extension's own https://<id>.chromiumapp.org/ address, which must be in the project's Redirect URLs.
 * The code_verifier stays in this extension's storage, so a code leaked elsewhere is useless.
 */
async function signInOAuth(provider: OAuthProvider) {
  if (!OAUTH_PROVIDERS.some((p) => p.key === provider)) throw new Error('Provedor de login desconhecido.');
  await lock('sign-in');
  await chrome.storage.session.remove('authError');
  try {
    const redirectTo = chrome.identity.getRedirectURL();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo, skipBrowserRedirect: true, ...oauthOptions(provider) },
    });
    if (error || !data.url) throw new Error(error?.message ?? 'Não foi possível iniciar o login.');
    const result = await chrome.identity.launchWebAuthFlow({ url: data.url, interactive: true });
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(oauthCodeFrom(result, redirectTo));
    if (exchangeError) throw new Error(exchangeError.message);
  } catch (err) {
    // The popup usually closed when the provider window opened: keep the message for its next opening.
    const message = friendlyError(err, 'Não foi possível entrar.');
    await chrome.storage.session.set({ authError: message });
    throw new Error(message);
  } finally {
    // Reopen the popup so the user continues (MFA or master password) without hunting for the icon.
    await chrome.action.openPopup().catch(() => undefined);
  }
}

async function verifyMfa(code: string) {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw new Error(error.message);
  const factor = data.totp.find((f) => f.status === 'verified');
  if (!factor) throw new Error('Ative a verificação em duas etapas no app web primeiro.');
  const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.replace(/\s/g, '') });
  if (verifyError) throw new Error('Código inválido ou expirado. Tente de novo.');
}

async function unlock(masterPassword: string) {
  // Slows down guessing from a stolen, signed-in browser profile (the KDF already costs ~1 s).
  if (failedUnlocks >= 3) await new Promise((r) => setTimeout(r, Math.min(30, 2 ** (failedUnlocks - 2)) * 1000));
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('Entre na conta primeiro.');
  const profile = await fetchProfile();
  if (!profile) throw new Error('Crie o cofre no app web primeiro.');
  let extractable: CryptoKey;
  try {
    extractable = await unlockWithPassword(profile, masterPassword, true);
  } catch {
    failedUnlocks += 1;
    logClientEvent('vault.unlock_failed', undefined, { client: 'extension' });
    throw new Error('Senha mestra incorreta.');
  }
  failedUnlocks = 0;
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', extractable));
  dek = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  userId = data.user.id;
  await chrome.storage.session.set({ dek: toBase64(raw), userId, lastActivity: Date.now() });
  raw.fill(0);
  logClientEvent('vault.unlocked', undefined, { client: 'extension' });
}

/* ------------------------------------------------------------------ vault */

async function vaultItems(): Promise<VaultItem[]> {
  if (!dek || !userId) throw new Error('O cofre está bloqueado.');
  if (items) return items;
  if (!loading) {
    const ctx = { dek, userId };
    loading = (async () => {
      const keyPair = await ensureUserKeyPair(ctx).catch(() => null);
      const result = await loadItems(ctx, keyPair, new Map());
      // Only logins are filled; expired shares never come back from the server.
      items = result.items.filter((i) => i.data.type === 'login');
      return items;
    })().finally(() => {
      loading = null;
    });
  }
  return loading;
}

async function list(tabUrl: string | null): Promise<ItemSummary[]> {
  const all = await vaultItems();
  const rank = { exact: 0, domain: 1, none: 2 } as const;
  return all
    .map((i) => ({
      id: i.id,
      title: i.data.title,
      username: i.data.username,
      url: i.data.url,
      favorite: i.data.favorite,
      shared: i.access !== 'owner',
      match: tabUrl && i.data.url ? matchItem(i.data.url, tabUrl) : ('none' as const),
    }))
    .sort((a, b) => rank[a.match] - rank[b.match] || Number(b.favorite) - Number(a.favorite) || a.title.localeCompare(b.title, 'pt-BR'));
}

async function findItem(itemId: string) {
  const item = (await vaultItems()).find((i) => i.id === itemId);
  if (!item) throw new Error('Item não encontrado. Ele pode ter sido excluído ou o compartilhamento expirou.');
  return item;
}

/* ------------------------------------------------------------------ fill */

async function fill(itemId: string, tabId: number, confirmMismatch = false): Promise<FillResponse> {
  const item = await findItem(itemId);
  const tab = await chrome.tabs.get(tabId);
  const pageUrl = tab.url;
  if (!pageUrl || !/^https?:/.test(pageUrl)) {
    return { ok: false, error: 'Esta aba não é um site (http/https). Abra a página de login e tente de novo.' };
  }
  const match = item.data.url ? matchItem(item.data.url, pageUrl) : 'none';
  if (match === 'none' && !confirmMismatch) {
    const reason = item.data.url
      ? `Este login é de ${new URL(/^https?:/i.test(item.data.url) ? item.data.url : `https://${item.data.url}`).hostname}, mas a aba está em ${new URL(pageUrl).hostname}.`
      : 'Este login não tem site salvo.';
    return { ok: false, needsConfirm: true, reason };
  }

  const scans = await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func: scanLoginFields });
  const eligible = scans.filter((s) => {
    const r = s.result as FrameScan | undefined;
    if (!r || !(r.passwords || r.users)) return false;
    if (!sameSite(r.href, pageUrl)) return false;
    // An https item is never sent to a frame served over http.
    if (/^https:/i.test(item.data.url) && !/^https:/i.test(r.href)) return false;
    return true;
  });
  const target =
    eligible.find((s) => s.frameId === 0 && (s.result as FrameScan).passwords > 0) ??
    eligible.find((s) => (s.result as FrameScan).passwords > 0) ??
    eligible.find((s) => s.frameId === 0) ??
    eligible[0];
  if (!target) return { ok: false, error: 'Não encontrei campos de login visíveis nesta página.' };

  const injection = target.documentId
    ? { tabId, documentIds: [target.documentId] }
    : { tabId, frameIds: [target.frameId] };
  const [result] = await chrome.scripting.executeScript({
    target: injection,
    func: fillLoginFields,
    args: [item.data.username, item.data.password],
  });
  const filled = (result?.result as { username: boolean; password: boolean } | undefined) ?? { username: false, password: false };
  if (!filled.username && !filled.password) return { ok: false, error: 'Não foi possível preencher os campos desta página.' };
  // Item id only: the site address is encrypted in the item and never goes to the server.
  logClientEvent('item.filled', { type: 'item', id: item.id }, { client: 'extension', mismatch: match === 'none' });
  return { ok: true, filled };
}

/* ------------------------------------------------------------------ clipboard */

async function scheduleClipboardClear() {
  await chrome.alarms.create('clear-clipboard', { delayInMinutes: 0.5 });
}

async function clearClipboard() {
  const url = 'offscreen.html';
  const existing = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] });
  if (!existing.length) {
    await chrome.offscreen.createDocument({ url, reasons: [chrome.offscreen.Reason.CLIPBOARD], justification: 'Limpar a senha copiada da área de transferência' });
  }
  await chrome.runtime.sendMessage({ target: 'offscreen', type: 'clear-clipboard' }).catch(() => undefined);
  await chrome.offscreen.closeDocument().catch(() => undefined);
}

/* ------------------------------------------------------------------ wiring */

async function handle(request: Request): Promise<unknown> {
  await ready;
  if (dek) {
    const { lastActivity } = await chrome.storage.session.get('lastActivity');
    if (Date.now() - Number(lastActivity ?? 0) > IDLE_MINUTES * 60_000) await lock('idle');
  }
  switch (request.type) {
    case 'status':
      return status();
    case 'signIn':
      return signIn(request.email, request.password);
    case 'providers':
      return fetchEnabledProviders();
    case 'signInOAuth':
      return signInOAuth(request.provider);
    case 'verifyMfa':
      return verifyMfa(request.code);
    case 'unlock':
      return unlock(request.masterPassword);
    case 'lock':
      return lock('manual');
    case 'signOut':
      await lock('sign-out');
      await supabase.auth.signOut({ scope: 'local' });
      return null;
    case 'list':
      await touch();
      return list(request.tabUrl);
    case 'fill':
      await touch();
      return fill(request.itemId, request.tabId, request.confirmMismatch);
    case 'reveal': {
      await touch();
      const item = await findItem(request.itemId);
      return request.field === 'password' ? item.data.password : item.data.username;
    }
    case 'clipboardCopied':
      return scheduleClipboardClear();
    default:
      throw new Error('Pedido desconhecido.');
  }
}

chrome.runtime.onMessage.addListener((request: Request, sender, sendResponse) => {
  // Only our own extension pages (the popup). Content scripts and web pages are refused.
  const fromPopup = sender.id === chrome.runtime.id && sender.url?.startsWith(chrome.runtime.getURL('popup.html'));
  if (!fromPopup || (request as { target?: string }).target === 'offscreen') return false;
  handle(request).then(
    (data) => sendResponse({ ok: true, data } satisfies Response),
    (error) => sendResponse({ ok: false, error: friendlyError(error) } satisfies Response),
  );
  return true;
});

chrome.alarms.create('auto-lock', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  await ready;
  if (alarm.name === 'clear-clipboard') return clearClipboard();
  if (alarm.name === 'auto-lock' && dek) {
    const { lastActivity } = await chrome.storage.session.get('lastActivity');
    if (Date.now() - Number(lastActivity ?? 0) > IDLE_MINUTES * 60_000) await lock('idle');
  }
});

chrome.idle.onStateChanged.addListener((state) => {
  if (state === 'locked') void ready.then(() => lock('system-locked'));
});

// Ctrl+Shift+L: fills when exactly one saved login matches the tab; otherwise opens the popup.
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'fill-login' || !tab?.id) return;
  await ready;
  const open = () => chrome.action.openPopup().catch(() => undefined);
  if (!dek || !tab.url) return open();
  await touch();
  const matches = (await list(tab.url)).filter((i) => i.match !== 'none');
  if (matches.length !== 1) return open();
  const result = await fill(matches[0].id, tab.id).catch(() => null);
  if (!result?.ok) return open();
});
