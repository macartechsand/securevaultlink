/**
 * "Lembrar e-mail" on the sign-in screen (as in Bitwarden): only the address, never a password,
 * stored on this device after the person opts in. Storage may be unavailable (private mode).
 */
const KEY = 'sv.auth.rememberedEmail';

export function readRememberedEmail(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function rememberEmail(email: string, remember: boolean) {
  try {
    if (remember && email) localStorage.setItem(KEY, email.trim().toLowerCase());
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: nothing to remember */
  }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const looksLikeEmail = (value: string) => EMAIL.test(value.trim());
