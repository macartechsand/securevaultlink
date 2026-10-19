import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { appRedirectUrl } from '../lib/authRedirect';
import { supabase } from '../lib/supabase';

export type OAuthProvider = 'google' | 'github';
export const OAUTH_PROVIDERS: { key: OAuthProvider; name: string }[] = [
  { key: 'google', name: 'Google' },
  { key: 'github', name: 'GitHub' },
];

export const ACCOUNT_PASSWORD_MIN_LENGTH = 10;

export async function signUp(email: string, password: string) {
  return supabase.auth.signUp({ email, password, options: { emailRedirectTo: appRedirectUrl() } });
}

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

/** Sends the "reset account password" e-mail (requires working e-mail delivery / SMTP). */
export async function requestPasswordReset(email: string) {
  return supabase.auth.resetPasswordForEmail(email, { redirectTo: appRedirectUrl() });
}

export async function resendConfirmation(email: string) {
  return supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: appRedirectUrl() } });
}

/** Sets the account (login) password of the signed-in user. Never the vault master password. */
export async function setAccountPassword(password: string) {
  return supabase.auth.updateUser({ password });
}

/**
 * OAuth 2.0 Authorization Code + PKCE through Supabase Auth: Supabase generates state and the
 * code_verifier, the provider only returns a one-time code, provider tokens are not stored by the app.
 */
export async function signInWithOAuth(provider: OAuthProvider) {
  return supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: appRedirectUrl(),
      scopes: provider === 'github' ? 'read:user user:email' : 'openid email profile',
      queryParams: provider === 'google' ? { prompt: 'select_account' } : undefined,
    },
  });
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

/** Redeems an admin-generated invite / reset link (hashed one-time token). */
export async function redeemOtp(tokenHash: string, type: 'invite' | 'recovery') {
  return supabase.auth.verifyOtp({ token_hash: tokenHash, type });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function getSession() {
  return supabase.auth.getSession();
}

export function onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void) {
  return supabase.auth.onAuthStateChange(callback);
}

/**
 * Forgotten master password without a recovery key: erases the caller's vault on the server
 * (account, MFA and roles are kept). Irreversible.
 */
export async function resetMyVault() {
  const { data, error } = await supabase.functions.invoke('account', { body: { action: 'reset_vault', confirm: 'APAGAR COFRE' } });
  if (!error && (data as { ok?: boolean } | null)?.ok) return;
  let message = 'Não foi possível recomeçar o cofre.';
  try {
    const ctx = (error as { context?: Response } | null)?.context;
    const payload = ctx ? await ctx.json() : null;
    if (payload?.error) message = payload.error;
  } catch {
    /* keep default */
  }
  throw new Error(message);
}
