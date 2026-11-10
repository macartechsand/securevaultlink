/**
 * What to offer after a login or sign-up form is sent on a site: save a new login, update the
 * password of an existing one, or nothing (already saved, or only view access).
 * `candidates` are the saved logins that match the page (domainMatch), never other sites.
 */
export type SaveCandidate = { id: string; username: string; password: string; access: 'owner' | 'view' | 'edit' }
export type SaveDecision = { mode: 'new' } | { mode: 'update'; itemId: string } | null

export const MAX_USERNAME = 256
export const MAX_PASSWORD = 512

const norm = (s: string) => s.trim().toLowerCase()

export function decideSave(candidates: SaveCandidate[], username: string, password: string): SaveDecision {
  if (!password || password.length > MAX_PASSWORD || username.length > MAX_USERNAME) return null
  if (username.trim()) {
    const same = candidates.filter((c) => norm(c.username) === norm(username))
    if (same.some((c) => c.password === password)) return null
    const editable = same.find((c) => c.access !== 'view')
    if (editable) return { mode: 'update', itemId: editable.id }
    // A login shared with me as view-only: I cannot change it, and a second copy would only confuse.
    if (same.length) return null
    return { mode: 'new' }
  }
  // No username on the form (password-only step): update only when there is no doubt about which login.
  if (candidates.some((c) => c.password === password)) return null
  const editable = candidates.filter((c) => c.access !== 'view')
  if (editable.length === 1) return { mode: 'update', itemId: editable[0].id }
  return { mode: 'new' }
}

/** "Never save on this site" is stored as a hash, so the list of sites is not kept in clear. */
export async function siteHash(site: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`securelink-never:${site}`))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Random, unguessable token that ties an extension frame to one tab and frame. */
export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
