/**
 * Native app (Capacitor) integration. Everything here is a no-op in the browser, so the web app,
 * the PWA and the tests keep their current behaviour.
 *
 * - OAuth: the provider page opens in the system browser (Custom Tabs) and returns to
 *   app.securelink.vault://auth-callback with a one-time PKCE code; the code_verifier never leaves
 *   the app, so a code intercepted by another app is useless.
 * - Files: decrypted bytes go to the app's private cache only long enough for the system share
 *   sheet, then the copy is deleted.
 * - Background: the vault locks when the app stays in the background longer than the grace period.
 */
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { toBase64 } from './crypto/encoding';
import { nativeAuthCode } from './nativeShell';

export const isNativeApp = () => Capacitor.isNativePlatform();

/** Long enough to copy a password and paste it in another app. */
export const BACKGROUND_LOCK_MS = 60_000;

export async function openInSystemBrowser(url: string) {
  await Browser.open({ url, presentationStyle: 'popover' });
}

/**
 * Handles OAuth deep links. `exchange` receives the code (supabase.auth.exchangeCodeForSession).
 * Returns a function that removes the listener.
 */
export function listenForNativeAuth(exchange: (code: string) => Promise<void>, onError: (message: string) => void) {
  if (!isNativeApp()) return () => undefined;
  const handle = App.addListener('appUrlOpen', ({ url }) => {
    const result = nativeAuthCode(url);
    if (!result) return;
    void Browser.close().catch(() => undefined);
    if ('error' in result) onError(result.error);
    else exchange(result.code).catch((err: unknown) => onError(err instanceof Error ? err.message : 'Não foi possível entrar.'));
  });
  return () => void handle.then((h) => h.remove());
}

/** Calls `lock` when the app returns after more than BACKGROUND_LOCK_MS in the background. */
export function lockAfterBackground(lock: () => void) {
  if (!isNativeApp()) return () => undefined;
  let hiddenAt: number | null = null;
  const handle = App.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) {
      hiddenAt = Date.now();
      return;
    }
    if (hiddenAt !== null && Date.now() - hiddenAt > BACKGROUND_LOCK_MS) lock();
    hiddenAt = null;
  });
  return () => void handle.then((h) => h.remove());
}

/** Native replacement for the browser download: private cache → share sheet → delete. */
export async function shareDecryptedFile(bytes: Uint8Array<ArrayBuffer>, name: string) {
  const path = `share/${crypto.randomUUID()}/${name}`;
  const written = await Filesystem.writeFile({ path, data: toBase64(bytes), directory: Directory.Cache, recursive: true });
  try {
    await Share.share({ title: name, files: [written.uri], dialogTitle: 'Salvar ou enviar' });
  } catch (err) {
    // Closing the share sheet is a normal choice, not an error.
    if (!(err instanceof Error && /cancel/i.test(err.message))) throw err;
  } finally {
    await Filesystem.rmdir({ path: path.slice(0, path.lastIndexOf('/')), directory: Directory.Cache, recursive: true }).catch(() => undefined);
  }
}
