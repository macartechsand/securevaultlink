/**
 * OAuth providers shared by the web app and the browser extension. No DOM or Supabase client here,
 * so the extension's service worker can import it.
 */
export type OAuthProvider = 'google' | 'github';

export const OAUTH_PROVIDERS: { key: OAuthProvider; name: string }[] = [
  { key: 'google', name: 'Google' },
  { key: 'github', name: 'GitHub' },
];

/** Minimal scopes: identity and e-mail only. Provider tokens are not stored by the app. */
export function oauthOptions(provider: OAuthProvider) {
  return {
    scopes: provider === 'github' ? 'read:user user:email' : 'openid email profile',
    queryParams: provider === 'google' ? { prompt: 'select_account' } : undefined,
  };
}

/** Which OAuth providers are enabled on the Supabase project (public settings endpoint). */
export async function fetchEnabledProviders(): Promise<OAuthProvider[]> {
  try {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
    if (!res.ok) return [];
    const data = (await res.json()) as { external?: Record<string, boolean> };
    return OAUTH_PROVIDERS.map((p) => p.key).filter((k) => data.external?.[k] === true);
  } catch {
    return [];
  }
}
