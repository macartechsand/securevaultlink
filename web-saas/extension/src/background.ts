/**
 * Background service worker: the only place that holds vault keys and decrypted items.
 *
 * - Keys and items live in memory. The raw DEK is also kept in chrome.storage.session (RAM only,
 *   readable by extension pages but not by content scripts) so a service-worker restart does not
 *   ask for the master password again. It is wiped on lock, browser close and after IDLE_MINUTES.
 * - Three kinds of senders, each with its own short list of requests (see the router at the end):
 *   the popup; the extension's own frames shown inside pages (suggestions menu, save bar); and the
 *   content script, which lives in the page's process and is treated as untrusted (never receives a
 *   saved secret; its page URL, tab and frame come from the browser, not from the message).
 * - A fill is a two-step injection: scan frames without secrets, then send the credential to one
 *   frame of the same site as the tab, in the same document that was scanned.
 * - Saving a password typed on a site only happens after a click on the save bar.
 */
import { unlockWithPassword } from '../../src/lib/crypto';
import { fromBase64, toBase64 } from '../../src/lib/crypto/encoding';
import { emptyItem } from '../../src/lib/items';
import { friendlyError } from '../../src/lib/messages';
import { describeUserAgent } from '../../src/lib/posture';
import { parseOtp, totpCode } from '../../src/lib/totp';
import { type UsageAction, encryptUsage } from '../../src/lib/usage';
import { generatePassword } from '../../src/lib/passwordGenerator';
import { type OAuthProvider, OAUTH_PROVIDERS, fetchEnabledProviders, oauthOptions } from '../../src/lib/oauthProviders';
import { logClientEvent } from '../../src/services/auditService';
import { ensureUserKeyPair } from '../../src/services/fileService';
import { fetchProfile } from '../../src/services/vaultService';
import { type ItemKeys, createItem, loadItems, saveItem, type VaultItem } from '../../src/state/itemOps';
import { matchItem, pageInfo, sameSite } from './domainMatch';
import { oauthCodeFrom } from './oauthCallback';
import { type FrameScan, fillLoginFields, fillNewPasswordFields, scanLoginFields } from './pageScripts';
import {
  type ContentCommand,
  type ContentRequest,
  DEFAULT_SETTINGS,
  type ExtSettings,
  type FillResponse,
  type FrameRequest,
  type InlineData,
  type ItemSummary,
  type Request,
  type Response,
  type SaveData,
  type SettingsResponse,
  type StatusResponse,
} from './protocol';
import { MAX_USERNAME, decideSave, newToken, siteHash } from './saveLogic';
import { supabase } from './supabase';

const IDLE_MINUTES = 10;
const SESSION_KEYS = ['dek', 'userId', 'lastActivity'] as const;

let dek: CryptoKey | null = null;
let userId: string | null = null;
let items: VaultItem[] | null = null;
let itemKeys: ItemKeys = new Map();
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
  itemKeys = new Map();
  loading = null;
  // Pending saves hold a typed password: they never outlive the unlocked vault.
  await chrome.storage.session.remove([...SESSION_KEYS, INLINE_KEY, PENDING_KEY]);
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
      const keys: ItemKeys = new Map();
      const result = await loadItems(ctx, keyPair, keys);
      itemKeys = keys;
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
      hasOtp: Boolean(i.data.otp),
      match: tabUrl && i.data.url ? matchItem(i.data.url, tabUrl) : ('none' as const),
    }))
    .sort((a, b) => rank[a.match] - rank[b.match] || Number(b.favorite) - Number(a.favorite) || a.title.localeCompare(b.title, 'pt-BR'));
}

/* ------------------------------------------------------------------ last used (Premium) */

let premiumCache: { value: boolean; at: number } | null = null;
async function isPremium(): Promise<boolean> {
  if (premiumCache && Date.now() - premiumCache.at < 10 * 60_000) return premiumCache.value;
  const { data } = await supabase.rpc('my_plan_limits');
  const row = Array.isArray(data) ? data[0] : data;
  premiumCache = { value: (row as { plan?: string } | null)?.plan === 'premium', at: Date.now() };
  return premiumCache.value;
}

/** Records where and when the item was used, encrypted with the item key. Never blocks the fill. */
async function recordUse(item: VaultItem, action: UsageAction, host: string) {
  try {
    const key = itemKeys.get(item.id);
    if (!key || !userId || !(await isPremium())) return;
    const blob = await encryptUsage(key, item.id, userId, { at: new Date().toISOString(), action, host, client: 'extension', device: describeUserAgent(navigator.userAgent) });
    await supabase.from('item_usage').upsert({ item_id: item.id, ...blob }, { onConflict: 'item_id,user_id' });
  } catch {
    /* best effort */
  }
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
  void recordUse(item, 'filled', new URL(pageUrl).hostname);
  return { ok: true, filled };
}

/* ------------------------------------------------------------------ in-page menu and save bar */

const INLINE_KEY = 'inlineTokens';
const PENDING_KEY = 'pendingSaves';
const INLINE_TTL = 10 * 60_000;
const PENDING_TTL = 5 * 60_000;
/** A pending save bar is shown again after navigations (login redirects) for this long. */
const RESHOW_MS = 2 * 60_000;

type InlineToken = { tabId: number; frameId: number; documentId?: string; url: string; kind: 'login' | 'new'; at: number };
type PendingSave = {
  tabId: number;
  url: string;
  host: string;
  username: string;
  password: string;
  mode: 'new' | 'update';
  itemId: string | null;
  generated: boolean;
  at: number;
  shown: number;
};

// chrome.storage.session: RAM only, readable by extension pages but not by content scripts, and it
// survives service-worker restarts (the user may take a while to click "Salvar").
async function readMap<T extends { at: number }>(key: string, ttl: number): Promise<Record<string, T>> {
  const raw = ((await chrome.storage.session.get(key))[key] ?? {}) as Record<string, T>;
  const now = Date.now();
  return Object.fromEntries(Object.entries(raw).filter(([, v]) => now - v.at < ttl));
}
const writeMap = (key: string, value: Record<string, unknown>) => chrome.storage.session.set({ [key]: value });

async function getSettings(): Promise<ExtSettings> {
  const { settings } = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...((settings as Partial<ExtSettings> | undefined) ?? {}) };
}

async function neverList(): Promise<string[]> {
  const { neverSave } = await chrome.storage.local.get('neverSave');
  return Array.isArray(neverSave) ? (neverSave as string[]) : [];
}

const hostOf = (url: string) => new URL(url).hostname.replace(/^www\./, '');
const sendToFrame = (tabId: number, frameId: number, msg: ContentCommand) =>
  chrome.tabs.sendMessage(tabId, msg, { frameId }).catch(() => undefined);

async function matchesFor(url: string) {
  return (await vaultItems()).filter((i) => i.data.url && matchItem(i.data.url, url) !== 'none');
}

/** The frame must belong to the same site as the tab (no suggestions inside third-party frames). */
async function sameSiteAsTab(tabId: number, frameUrl: string) {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  return Boolean(tab?.url && sameSite(frameUrl, tab.url));
}

async function inlineToken(token: string, tabId: number): Promise<InlineToken> {
  const t = (await readMap<InlineToken>(INLINE_KEY, INLINE_TTL))[token];
  if (!t || t.tabId !== tabId) throw new Error('Menu expirado. Clique no campo de novo.');
  return t;
}

async function pendingSave(token: string, tabId: number): Promise<PendingSave> {
  const p = (await readMap<PendingSave>(PENDING_KEY, PENDING_TTL))[token];
  if (!p || p.tabId !== tabId) throw new Error('Pedido expirado.');
  return p;
}

async function dropPending(token: string) {
  const all = await readMap<PendingSave>(PENDING_KEY, PENDING_TTL);
  delete all[token];
  await writeMap(PENDING_KEY, all);
}

async function showSave(token: string) {
  const all = await readMap<PendingSave>(PENDING_KEY, PENDING_TTL);
  const p = all[token];
  if (!p) return;
  all[token] = { ...p, shown: p.shown + 1 };
  await writeMap(PENDING_KEY, all);
  await sendToFrame(p.tabId, 0, { type: 'cs.showSave', token });
}

async function stagePending(p: Omit<PendingSave, 'at' | 'shown'>) {
  const all = await readMap<PendingSave>(PENDING_KEY, PENDING_TTL);
  // One bar per tab: a newer form replaces an older, unanswered one.
  for (const [k, v] of Object.entries(all)) if (v.tabId === p.tabId) delete all[k];
  const token = newToken();
  all[token] = { ...p, at: Date.now(), shown: 0 };
  await writeMap(PENDING_KEY, all);
  await showSave(token);
}

/** Login form sent on a page: offer to save or update, if it is new information. */
async function captured(tabId: number, url: string, username: unknown, password: unknown) {
  if (typeof username !== 'string' || typeof password !== 'string') return;
  if (!(await getSettings()).offerSave || !(await sameSiteAsTab(tabId, url))) return;
  const info = pageInfo(url);
  if (!info || (await neverList()).includes(await siteHash(info.site))) return;
  const user = username.trim().slice(0, MAX_USERNAME);

  // A password generated by the menu is already pending: the form now tells which user it was for.
  const all = await readMap<PendingSave>(PENDING_KEY, PENDING_TTL);
  const generated = Object.entries(all).find(([, p]) => p.tabId === tabId && p.generated && p.password === password);
  if (generated) {
    const [token, p] = generated;
    if (user) {
      all[token] = { ...p, username: user };
      await writeMap(PENDING_KEY, all);
    }
    await showSave(token);
    return;
  }

  const matches = await matchesFor(url);
  const decision = decideSave(
    matches.map((i) => ({ id: i.id, username: i.data.username, password: i.data.password, access: i.access })),
    user,
    password,
  );
  if (!decision) return;
  await stagePending({
    tabId,
    url,
    host: hostOf(url),
    username: user,
    password,
    mode: decision.mode,
    itemId: decision.mode === 'update' ? decision.itemId : null,
    generated: false,
  });
}

async function autofillOnLoad(tabId: number, url: string) {
  if (!(await getSettings()).autofillOnLoad || !/^https:/i.test(url)) return;
  const exact = (await matchesFor(url)).filter((i) => matchItem(i.data.url, url) === 'exact');
  // Only when there is no choice to make; anything else waits for the user.
  if (exact.length === 1) await fill(exact[0].id, tabId).catch(() => null);
}

async function handleContent(request: ContentRequest, sender: chrome.runtime.MessageSender): Promise<unknown> {
  const tabId = sender.tab!.id!;
  const frameId = sender.frameId ?? 0;
  const url = sender.url!;
  if (!dek) return null;
  switch (request?.type) {
    case 'cs.focus': {
      if (request.kind !== 'login' && request.kind !== 'new') return null;
      if (!(await getSettings()).inlineMenu || !(await sameSiteAsTab(tabId, url))) return null;
      if (request.kind === 'login' && !(await matchesFor(url)).length) return null;
      const all = await readMap<InlineToken>(INLINE_KEY, INLINE_TTL);
      const token = newToken();
      all[token] = { tabId, frameId, documentId: sender.documentId, url, kind: request.kind, at: Date.now() };
      await writeMap(INLINE_KEY, all);
      return { token };
    }
    case 'cs.captured':
      await captured(tabId, url, request.username, request.password);
      return null;
    case 'cs.pageReady':
      if (frameId === 0) await autofillOnLoad(tabId, url);
      return null;
    default:
      throw new Error('Pedido desconhecido.');
  }
}

const frameTarget = (t: InlineToken) => (t.documentId ? { tabId: t.tabId, documentIds: [t.documentId] } : { tabId: t.tabId, frameIds: [t.frameId] });

async function handleFrame(request: FrameRequest, tabId: number): Promise<unknown> {
  switch (request?.type) {
    case 'fr.inlineData': {
      const t = await inlineToken(request.token, tabId);
      if (!dek) throw new Error('O cofre está bloqueado. Abra pelo ícone da extensão.');
      const data: InlineData = {
        host: hostOf(t.url),
        kind: t.kind,
        items: (await matchesFor(t.url))
          .map((i) => ({ id: i.id, title: i.data.title, username: i.data.username, exact: matchItem(i.data.url, t.url) === 'exact' }))
          .sort((a, b) => Number(b.exact) - Number(a.exact) || a.title.localeCompare(b.title, 'pt-BR')),
      };
      return data;
    }
    case 'fr.inlineFill': {
      const t = await inlineToken(request.token, tabId);
      await touch();
      const item = await findItem(request.itemId);
      if (!item.data.url || matchItem(item.data.url, t.url) === 'none') throw new Error('Este login não é deste site.');
      if (!(await sameSiteAsTab(tabId, t.url))) throw new Error('A página mudou. Clique no campo de novo.');
      const [result] = await chrome.scripting.executeScript({ target: frameTarget(t), func: fillLoginFields, args: [item.data.username, item.data.password] });
      const filled = result?.result as { username: boolean; password: boolean } | undefined;
      if (!filled?.username && !filled?.password) throw new Error('Não foi possível preencher os campos desta página.');
      logClientEvent('item.filled', { type: 'item', id: item.id }, { client: 'extension', inline: true });
      void recordUse(item, 'filled', hostOf(t.url));
      await sendToFrame(tabId, t.frameId, { type: 'cs.close', which: 'inline' });
      return null;
    }
    case 'fr.inlineGenerate': {
      const t = await inlineToken(request.token, tabId);
      if (t.kind !== 'new') throw new Error('Este campo não é de senha nova.');
      await touch();
      const password = generatePassword({ length: 20, uppercase: true, numbers: true, symbols: true });
      const [result] = await chrome.scripting.executeScript({ target: frameTarget(t), func: fillNewPasswordFields, args: [password] });
      if (!result?.result) throw new Error('Não encontrei o campo de senha nova.');
      await sendToFrame(tabId, t.frameId, { type: 'cs.close', which: 'inline' });
      // Staged right away: if the form is never captured, the generated password is not lost.
      await stagePending({ tabId, url: t.url, host: hostOf(t.url), username: '', password, mode: 'new', itemId: null, generated: true });
      return null;
    }
    case 'fr.saveData': {
      const p = await pendingSave(request.token, tabId);
      const title = p.itemId ? ((items ?? []).find((i) => i.id === p.itemId)?.data.title ?? null) : null;
      const data: SaveData = { host: p.host, username: p.username, mode: p.mode, title, generated: p.generated };
      return data;
    }
    case 'fr.saveDecide': {
      const p = await pendingSave(request.token, tabId);
      if (request.decision === 'dismiss') {
        await dropPending(request.token);
        return null;
      }
      if (request.decision === 'never') {
        const info = pageInfo(p.url);
        if (info) await chrome.storage.local.set({ neverSave: [...new Set([...(await neverList()), await siteHash(info.site)])] });
        await dropPending(request.token);
        return null;
      }
      if (request.decision !== 'save') throw new Error('Pedido desconhecido.');
      if (!dek || !userId) throw new Error('O cofre está bloqueado. Abra pelo ícone da extensão e tente de novo.');
      await touch();
      const ctx = { dek, userId };
      const all = await vaultItems();
      if (p.mode === 'update' && p.itemId) {
        const item = await findItem(p.itemId);
        if (item.access === 'view') throw new Error('Você só tem permissão de visualização neste login.');
        const updated = await saveItem(ctx, itemKeys, item, { ...item.data, password: p.password });
        items = all.map((i) => (i.id === updated.id ? updated : i));
        await dropPending(request.token);
        return { message: 'Senha atualizada no cofre.' };
      }
      const username = typeof request.username === 'string' ? request.username.trim().slice(0, MAX_USERNAME) : p.username;
      const created = await createItem(ctx, itemKeys, { ...emptyItem('login'), title: p.host, username, password: p.password, url: new URL(p.url).origin });
      items = [...all, created];
      await dropPending(request.token);
      return { message: 'Login salvo no cofre.' };
    }
    case 'fr.close': {
      const inline = (await readMap<InlineToken>(INLINE_KEY, INLINE_TTL))[request.token];
      if (inline?.tabId === tabId) return sendToFrame(tabId, inline.frameId, { type: 'cs.close', which: 'inline' });
      const pending = (await readMap<PendingSave>(PENDING_KEY, PENDING_TTL))[request.token];
      if (pending?.tabId === tabId) await dropPending(request.token);
      // A save bar whose request expired still closes.
      return sendToFrame(tabId, 0, { type: 'cs.close', which: 'save' });
    }
    case 'fr.resize': {
      const height = Number(request.height);
      if (!Number.isFinite(height)) return null;
      const inline = (await readMap<InlineToken>(INLINE_KEY, INLINE_TTL))[request.token];
      if (inline?.tabId === tabId) return sendToFrame(tabId, inline.frameId, { type: 'cs.resize', which: 'inline', height });
      const pending = (await readMap<PendingSave>(PENDING_KEY, PENDING_TTL))[request.token];
      if (pending?.tabId === tabId) return sendToFrame(tabId, 0, { type: 'cs.resize', which: 'save', height });
      return null;
    }
    default:
      throw new Error('Pedido desconhecido.');
  }
}

// After a login the site usually navigates: show the pending bar again on the new page.
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status !== 'complete') return;
  void (async () => {
    await ready;
    if (!dek) return;
    const all = await readMap<PendingSave>(PENDING_KEY, PENDING_TTL);
    for (const [token, p] of Object.entries(all)) {
      if (p.tabId === tabId && Date.now() - p.at < RESHOW_MS && p.shown < 4) await showSave(token);
    }
  })();
});
chrome.tabs.onRemoved.addListener((tabId) => {
  void (async () => {
    const all = await readMap<PendingSave>(PENDING_KEY, PENDING_TTL);
    const kept = Object.fromEntries(Object.entries(all).filter(([, p]) => p.tabId !== tabId));
    if (Object.keys(kept).length !== Object.keys(all).length) await writeMap(PENDING_KEY, kept);
  })();
});

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

async function preamble() {
  await ready;
  if (dek) {
    const { lastActivity } = await chrome.storage.session.get('lastActivity');
    if (Date.now() - Number(lastActivity ?? 0) > IDLE_MINUTES * 60_000) await lock('idle');
  }
}

async function handle(request: Request): Promise<unknown> {
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
      if (request.field === 'otp') {
        if (!item.data.otp) return '';
        void recordUse(item, 'otp', '');
        return (await totpCode(parseOtp(item.data.otp))).code;
      }
      if (request.field === 'password') void recordUse(item, 'copied', '');
      return request.field === 'password' ? item.data.password : item.data.username;
    }
    case 'clipboardCopied':
      return scheduleClipboardClear();
    case 'getSettings': {
      const res: SettingsResponse = { settings: await getSettings(), neverSaveSites: (await neverList()).length };
      return res;
    }
    case 'setSettings': {
      const next = { ...(await getSettings()) };
      for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof ExtSettings)[]) {
        const v = request.settings?.[k];
        if (typeof v === 'boolean') next[k] = v;
      }
      await chrome.storage.local.set({ settings: next });
      return next;
    }
    case 'clearNeverSave':
      await chrome.storage.local.remove('neverSave');
      return null;
    default:
      throw new Error('Pedido desconhecido.');
  }
}

chrome.runtime.onMessage.addListener((request: unknown, sender, sendResponse) => {
  // Web pages cannot message the extension (no externally_connectable). Each sender kind gets only
  // its own requests; anything else is refused.
  if (sender.id !== chrome.runtime.id || (request as { target?: string } | null)?.target === 'offscreen') return false;
  const url = sender.url ?? '';
  const tabId = sender.tab?.id;
  let work: (() => Promise<unknown>) | null = null;
  if (url.startsWith(chrome.runtime.getURL('popup.html'))) work = () => handle(request as Request);
  else if (tabId !== undefined && (url.startsWith(chrome.runtime.getURL('inline.html')) || url.startsWith(chrome.runtime.getURL('save.html'))))
    work = () => handleFrame(request as FrameRequest, tabId);
  else if (tabId !== undefined && !url.startsWith(chrome.runtime.getURL('')) && /^https?:/i.test(url))
    work = () => handleContent(request as ContentRequest, sender);
  if (!work) return false;
  const run = work;
  preamble().then(run).then(
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
