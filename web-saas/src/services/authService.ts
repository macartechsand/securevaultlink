import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { appRedirectUrl } from '../lib/authRedirect';
import { supabase } from '../lib/supabase';

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

export async function signOut() {
  return supabase.auth.signOut();
}

export async function getSession() {
  return supabase.auth.getSession();
}

export function onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void) {
  return supabase.auth.onAuthStateChange(callback);
}
