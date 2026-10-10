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

async function lookupThreats(url: string, apiKey: string): Promise<string[]> {
  const response = await fetch('https://safebrowsing.googleapis.com/v4/threatMatches:find', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey },
    body: JSON.stringify({
      client: { clientId: 'securevault', clientVersion: '1.0.0' },
      threatInfo: {
        threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'],
        platformTypes: ['ANY_PLATFORM'],
        threatEntryTypes: ['URL'],
        threatEntries: [{ url }],
      },
    }),
  })
  if (!response.ok) throw new Error(`provider status ${response.status}`)
  const data = await response.json()
  return [...new Set<string>((data.matches ?? []).map((m: { threatType: string }) => m.threatType))]
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

  let target: URL
  try {
    const body = await req.json()
    if (typeof body.url !== 'string' || body.url.length > 2048) throw new Error('bad url')
    target = new URL(body.url)
    if (target.protocol !== 'http:' && target.protocol !== 'https:') throw new Error('bad scheme')
  } catch {
    return json({ error: 'invalid url' }, 400)
  }

  const apiKey = Deno.env.get('SAFE_BROWSING_API_KEY')
  if (!apiKey) return json({ error: 'reputation provider not configured' }, 503)

  try {
    const threats = await lookupThreats(target.toString(), apiKey)
    return json({ status: threats.length ? 'unsafe' : 'no-known-threats', threats })
  } catch {
    return json({ error: 'reputation provider unavailable' }, 502)
  }
})
