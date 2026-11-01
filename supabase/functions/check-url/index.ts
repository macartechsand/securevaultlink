// Supabase Edge Function: URL reputation via Google Safe Browsing (Lookup API v4).
// The API key lives only in the function secrets (SAFE_BROWSING_API_KEY), never in the browser.
// Provider is isolated in lookupThreats() so it can be swapped for a paid service (e.g. Web Risk).
//
// Deploy:  supabase functions deploy check-url
// Secret:  supabase secrets set SAFE_BROWSING_API_KEY=<key>
// JWT verification stays ON (default): only signed-in users can call it.
import { createClient } from 'npm:@supabase/supabase-js@2'

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? '*'
const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

// Best-effort per-user rate limit (per function instance).
const WINDOW_MS = 60 * 60 * 1000
const MAX_PER_WINDOW = 60
const hits = new Map<string, number[]>()
function allowed(userId: string) {
  const now = Date.now()
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS)
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(userId, recent)
    return false
  }
  recent.push(now)
  hits.set(userId, recent)
  return true
}

const MAX_URLS = 50

/** Returns url -> threat types (empty array = no known threats). */
async function lookupThreats(urls: string[], apiKey: string): Promise<Map<string, string[]>> {
  const response = await fetch('https://safebrowsing.googleapis.com/v4/threatMatches:find', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey },
    body: JSON.stringify({
      client: { clientId: 'securevault', clientVersion: '1.0.0' },
      threatInfo: {
        threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'],
        platformTypes: ['ANY_PLATFORM'],
        threatEntryTypes: ['URL'],
        threatEntries: urls.map((url) => ({ url })),
      },
    }),
  })
  if (!response.ok) throw new Error(`provider status ${response.status}`)
  const data = await response.json()
  const result = new Map<string, string[]>(urls.map((url) => [url, []]))
  for (const match of (data.matches ?? []) as { threatType: string; threat: { url: string } }[]) {
    const list = result.get(match.threat.url)
    if (list && !list.includes(match.threatType)) list.push(match.threatType)
  }
  return result
}

function parseUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) return json({ error: 'unauthorized' }, 401)
  if (!allowed(userData.user.id)) return json({ error: 'rate limit exceeded' }, 429)

  // Body: { url: string } or { urls: string[] } (max 50).
  let urls: string[]
  try {
    const body = await req.json()
    const raw: unknown[] = Array.isArray(body.urls) ? body.urls : [body.url]
    if (raw.length === 0 || raw.length > MAX_URLS) throw new Error('bad size')
    const parsed = raw.map(parseUrl)
    if (parsed.some((u) => u === null)) throw new Error('bad url')
    urls = [...new Set(parsed as string[])]
  } catch {
    return json({ error: 'invalid url' }, 400)
  }

  const apiKey = Deno.env.get('SAFE_BROWSING_API_KEY')
  if (!apiKey) return json({ error: 'reputation provider not configured' }, 503)

  try {
    const threats = await lookupThreats(urls, apiKey)
    const results = urls.map((url) => {
      const found = threats.get(url) ?? []
      return { url, status: found.length ? 'unsafe' : 'no-known-threats', threats: found }
    })
    // Single-URL responses keep the original shape for compatibility.
    return json(results.length === 1 ? { ...results[0], results } : { results })
  } catch {
    return json({ error: 'reputation provider unavailable' }, 502)
  }
})
