/**
 * Reads auth-related URL parameters BEFORE the Supabase client processes the URL, then removes the
 * one-time ones from the address bar. Must be the first import in main.tsx.
 *
 * - Admin-generated invite / reset links: #sv_token_hash=…&sv_type=invite|recovery (fragment, so the
 *   token never reaches a web server or its logs). Redeemed with verifyOtp.
 * - OAuth / e-mail callbacks (PKCE): ?code=… is exchanged by the Supabase client itself.
 * - Errors from the provider or from the sign-up trigger: ?error_description=… / #error_description=…
 */
function params() {
  const hash = new URLSearchParams(window.location.hash.slice(1))
  const query = new URLSearchParams(window.location.search)
  return { hash, query }
}

function read() {
  try {
    const { hash, query } = params()
    const tokenHash = hash.get('sv_token_hash')
    const otpType = hash.get('sv_type')
    const pendingOtp =
      tokenHash && (otpType === 'invite' || otpType === 'recovery') ? { tokenHash, type: otpType as 'invite' | 'recovery' } : null
    const type = hash.get('type') ?? query.get('type')
    const error = hash.get('error_description') ?? query.get('error_description')
    if (pendingOtp || error) {
      // Drop one-time tokens and error noise from the URL (history, screenshots, shoulder surfing).
      const keepQuery = new URLSearchParams(window.location.search)
      ;['error', 'error_code', 'error_description'].forEach((k) => keepQuery.delete(k))
      const qs = keepQuery.toString()
      window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`)
    }
    return { pendingOtp, type, error }
  } catch {
    return { pendingOtp: null, type: null, error: null }
  }
}

const initial = read()

export const PENDING_OTP = initial.pendingOtp
export const AUTH_REDIRECT_TYPE = initial.pendingOtp?.type ?? initial.type
export const AUTH_REDIRECT_ERROR = initial.error

/** Invite and recovery links sign the person in; they must then choose an account password. */
export const ARRIVED_TO_SET_PASSWORD = AUTH_REDIRECT_TYPE === 'invite' || AUTH_REDIRECT_TYPE === 'recovery'

/** Where e-mails and OAuth providers should bring people back to (this app). */
export const appRedirectUrl = () => `${window.location.origin}/`

export function clearAuthParamsFromUrl() {
  if (window.location.hash || window.location.search.includes('type=') || window.location.search.includes('code=')) {
    window.history.replaceState(null, '', window.location.pathname)
  }
}
