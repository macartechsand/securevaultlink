/**
 * Have I Been Pwned "Pwned Passwords" range API (k-anonymity): only the first
 * 5 hex chars of the SHA-1 leave the device. The password itself is never sent.
 */
const RANGE_URL = 'https://api.pwnedpasswords.com/range/'

export async function sha1Hex(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-1', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()
}

/** Parses a range response into a map of SUFFIX -> count, ignoring padding (count 0). */
export function parseRange(body: string): Map<string, number> {
  const result = new Map<string, number>()
  for (const line of body.split(/\r?\n/)) {
    const [suffix, count] = line.trim().split(':')
    if (!suffix || count === undefined) continue
    const n = Number.parseInt(count, 10)
    if (Number.isFinite(n) && n > 0) result.set(suffix.toUpperCase(), n)
  }
  return result
}

export type PwnedResult = { status: 'ok'; count: number } | { status: 'error' }

export async function checkPwned(
  password: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PwnedResult> {
  try {
    const hash = await sha1Hex(password)
    const response = await fetchImpl(`${RANGE_URL}${hash.slice(0, 5)}`, {
      headers: { 'Add-Padding': 'true' },
      referrerPolicy: 'no-referrer',
      credentials: 'omit',
    })
    if (!response.ok) return { status: 'error' }
    const range = parseRange(await response.text())
    return { status: 'ok', count: range.get(hash.slice(5)) ?? 0 }
  } catch {
    return { status: 'error' }
  }
}

/** Checks distinct passwords sequentially (one request per unique 5-char prefix is cached). */
export async function checkPwnedMany(
  passwords: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<Map<string, PwnedResult>> {
  const results = new Map<string, PwnedResult>()
  for (const password of new Set(passwords.filter(Boolean))) {
    results.set(password, await checkPwned(password, fetchImpl))
  }
  return results
}
