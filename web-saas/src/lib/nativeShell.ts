/**
 * Dependency-free check for the native app shell. The Capacitor runtime defines a global
 * `Capacitor` object inside the app's WebView; browsers, the extension and tests do not have it.
 * Native-only code lives in ./platform and is loaded with a dynamic import.
 */
export function isNativeShell(): boolean {
  const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

/** Deep link the OAuth providers return to inside the app (must be in Supabase → Redirect URLs). */
export const NATIVE_AUTH_REDIRECT = 'app.securelink.vault://auth-callback';

/** Extracts the PKCE code from the deep link the provider returned to. Null when it is not ours. */
export function nativeAuthCode(url: string): { code: string } | { error: string } | null {
  if (url !== NATIVE_AUTH_REDIRECT && !['?', '#', '/'].some((c) => url.startsWith(NATIVE_AUTH_REDIRECT + c))) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { error: 'Resposta de login inválida.' };
  }
  const query = parsed.searchParams;
  const hash = new URLSearchParams(parsed.hash.slice(1));
  const failure = query.get('error_description') ?? hash.get('error_description') ?? query.get('error');
  if (failure) return { error: failure.replace(/\+/g, ' ') };
  const code = query.get('code');
  if (!code || !/^[A-Za-z0-9._~-]{8,512}$/.test(code)) return { error: 'O provedor não devolveu um código de login.' };
  return { code };
}
