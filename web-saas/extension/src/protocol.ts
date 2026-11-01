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
  | { type: 'reveal'; itemId: string; field: 'username' | 'password' }
  | { type: 'clipboardCopied' };

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

export async function send<T>(request: Request): Promise<T> {
  const res = (await chrome.runtime.sendMessage(request)) as Response<T> | undefined;
  if (!res) throw new Error('A extensão não respondeu. Feche e abra o popup.');
  if (!res.ok) throw new Error(res.error);
  return res.data;
}
