// Shared pieces of the rotate function (no credential value is ever logged or stored).

/** A failure with a code (audited) and a message for the user (never contains credential values). */
export class RotationError extends Error {
  constructor(public code: string, message: string, public status = 422) {
    super(message)
  }
}

export type Result = {
  /** New secret value, returned only to the caller's browser (which encrypts it). */
  secret: string
  /** Replaces the item's "Identificador/Usuário" (AWS: the new access key ID). */
  identifier?: string
  /** Platform id of the new credential, kept in the item's rotation config (Entra keyId, GCP key id). */
  keyId?: string
  expiresAt?: string | null
  /** Previous credential, removed by action "revoke_old" only after the vault saved the new one. */
  revokeOldId?: string
  /** True when the new credential was used successfully against the platform. */
  verified: boolean
  /** Non-blocking note for the user (e.g. old secret could not be identified). */
  warning?: string
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function timedFetch(url: string, init: RequestInit = {}) {
  try {
    return await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(15_000) })
  } catch {
    throw new RotationError('network', 'A plataforma não respondeu. Nada foi alterado; tente novamente.', 502)
  }
}

/** Retries `check` (propagation of new credentials) until it returns true or attempts run out. */
export async function eventually(check: () => Promise<boolean>, attempts: number, firstDelayMs: number, delayMs: number) {
  for (let i = 0; i < attempts; i++) {
    await sleep(i === 0 ? firstDelayMs : delayMs)
    if (await check().catch(() => false)) return true
  }
  return false
}

const ALPHABETS = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%^&*()_+-=[]{}|']

/** Random password with every character class (unbiased; rejection sampling). */
export function strongPassword(length = 32) {
  const all = ALPHABETS.join('')
  const pick = (set: string) => {
    const limit = 256 - (256 % set.length)
    for (;;) {
      const [b] = crypto.getRandomValues(new Uint8Array(1))
      if (b < limit) return set[b % set.length]
    }
  }
  const chars = ALPHABETS.map(pick)
  while (chars.length < length) chars.push(pick(all))
  // Fisher-Yates with unbiased indexes.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Number(crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1))
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

export const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
