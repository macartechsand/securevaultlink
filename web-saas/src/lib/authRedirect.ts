/**
 * Captures the type of an auth link (invite / recovery / signup) from the URL fragment BEFORE the
 * Supabase client consumes and clears it. Must be the first import in main.tsx.
 */
function readType(): string | null {
  try {
    const hash = new URLSearchParams(window.location.hash.slice(1))
    const query = new URLSearchParams(window.location.search)
    return hash.get('type') ?? query.get('type')
  } catch {
    return null
  }
}

export const AUTH_REDIRECT_TYPE = readType()

/** Invite and recovery links sign the person in; they must then choose an account password. */
export const ARRIVED_TO_SET_PASSWORD = AUTH_REDIRECT_TYPE === 'invite' || AUTH_REDIRECT_TYPE === 'recovery'

/** Where e-mails and links should bring people back to (this app). */
export const appRedirectUrl = () => `${window.location.origin}/`

export function clearAuthParamsFromUrl() {
  if (window.location.hash || window.location.search.includes('type=')) {
    window.history.replaceState(null, '', window.location.pathname)
  }
}
