/** Messages between the popup and the background service worker (extension pages only). */
import type { OAuthProvider } from '../../src/lib/oauthProviders';

export type ExtStatus = 'signed-out' | 'needs-mfa' | 'needs-setup' | 'locked' | 'unlocked';

export type ItemSummary = {
  id: string;
  title: string;
  username: string;
  url: string;
  favorite: boolean;
  shared: boolean;
  /** The login has a one-time code (OTP) secret. */
  hasOtp: boolean;
  /** Relation between the item URL and the active tab. */
  match: 'exact' | 'domain' | 'none';
};

export type Request =
  | { type: 'status' }
  | { type: 'signIn'; email: string; password: string }
  | { type: 'providers' }
  | { type: 'signInOAuth'; provider: OAuthProvider }
  | { type: 'verifyMfa'; code: string }
  | { type: 'unlock'; masterPassword: string }
  | { type: 'lock' }
  | { type: 'signOut' }
  | { type: 'list'; tabUrl: string | null }
  | { type: 'fill'; itemId: string; tabId: number; confirmMismatch?: boolean }
  | { type: 'reveal'; itemId: string; field: 'username' | 'password' | 'otp' }
  | { type: 'clipboardCopied' }
  | { type: 'getSettings' }
  | { type: 'setSettings'; settings: Partial<ExtSettings> }
  | { type: 'clearNeverSave' };

/** Options of the extension (chrome.storage.local, no secrets). */
export type ExtSettings = {
  /** Show suggestions under login fields (menu in an extension frame). */
  inlineMenu: boolean;
  /** Offer to save or update a password after a login or sign-up form is sent. */
  offerSave: boolean;
  /** Fill by itself when a page has exactly one exact (https) saved login. Off by default. */
  autofillOnLoad: boolean;
};
export const DEFAULT_SETTINGS: ExtSettings = { inlineMenu: true, offerSave: true, autofillOnLoad: false };
export type SettingsResponse = { settings: ExtSettings; neverSaveSites: number };

/**
 * From the content script (runs inside web pages: the least trusted sender). The page URL, tab and
 * frame always come from the browser (sender), never from the message. No request returns secrets.
 */
export type ContentRequest =
  | { type: 'cs.focus'; kind: 'login' | 'new' }
  | { type: 'cs.captured'; username: string; password: string }
  | { type: 'cs.pageReady' };

/** From the extension's own frames shown inside pages (inline.html, save.html). */
export type FrameRequest =
  | { type: 'fr.inlineData'; token: string }
  | { type: 'fr.inlineFill'; token: string; itemId: string }
  | { type: 'fr.inlineGenerate'; token: string }
  | { type: 'fr.saveData'; token: string }
  | { type: 'fr.saveDecide'; token: string; decision: 'save' | 'never' | 'dismiss'; username?: string }
  | { type: 'fr.close'; token: string }
  | { type: 'fr.resize'; token: string; height: number };

/** From the background to the content script of one frame. */
export type ContentCommand =
  | { type: 'cs.showSave'; token: string }
  | { type: 'cs.close'; which: 'inline' | 'save' }
  | { type: 'cs.resize'; which: 'inline' | 'save'; height: number };

export type InlineData = {
  host: string;
  kind: 'login' | 'new';
  items: { id: string; title: string; username: string; exact: boolean }[];
};

export type SaveData = {
  host: string;
  username: string;
  mode: 'new' | 'update';
  /** Title of the item that would be updated. */
  title: string | null;
  generated: boolean;
};

export type StatusResponse = {
  status: ExtStatus;
  email: string | null;
  idleMinutes: number;
  /** Error of the last Google/GitHub sign-in (the popup closes while the provider window is open). */
  authError?: string;
};

export type FillResponse =
  | { ok: true; filled: { username: boolean; password: boolean } }
  | { ok: false; needsConfirm: true; reason: string }
  | { ok: false; needsConfirm?: false; error: string };

export type Response<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

export async function send<T>(request: Request | FrameRequest): Promise<T> {
  const res = (await chrome.runtime.sendMessage(request)) as Response<T> | undefined;
  if (!res) throw new Error('A extensão não respondeu. Feche e abra o popup.');
  if (!res.ok) throw new Error(res.error);
  return res.data;
}
