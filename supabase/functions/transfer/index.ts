// Supabase Edge Function: public access to temporary transfers (recipients may have no account).
// The server never sees the decryption key: it lives only in the link fragment (#...).
// This function only enforces expiry, revocation and the download limit, and hands out a
// short-lived signed URL to the ENCRYPTED object.
//
// Deploy (public, no JWT):  supabase functions deploy transfer --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2'

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? '*'
const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SIGNED_URL_SECONDS = 60

// Best-effort per-IP rate limit (per function instance).
const WINDOW_MS = 10 * 60 * 1000
const MAX_PER_WINDOW = 60
const hits = new Map<string, number[]>()
function allowed(key: string) {
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS)
  recent.push(now)
  hits.set(key, recent)
  return recent.length <= MAX_PER_WINDOW
}

const unavailable = () => json({ error: 'This transfer is not available (expired, revoked or used up).' }, 404)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (!allowed(ip)) return json({ error: 'Too many requests. Try again later.' }, 429)

  let id: string
  let action: string
  try {
    const body = await req.json()
    id = String(body.id ?? '')
    action = String(body.action ?? '')
    if (!UUID.test(id) || !['info', 'download'].includes(action)) throw new Error('bad request')
  } catch {
    return json({ error: 'invalid request' }, 400)
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  if (action === 'info') {
    const { data, error } = await admin
      .from('transfers')
      .select('wrapped_key, password_salt, expires_at, max_downloads, download_count, revoked, vault_files!inner(id, encrypted_meta, chunk_size, size_bytes, status)')
      .eq('id', id)
      .maybeSingle()
    if (error || !data) return unavailable()
    const file = data.vault_files as unknown as { id: string; encrypted_meta: string; chunk_size: number; size_bytes: number; status: string }
    if (data.revoked || new Date(data.expires_at) <= new Date() || data.download_count >= data.max_downloads || file.status !== 'ready') {
      return unavailable()
    }
    return json({
      fileId: file.id,
      wrappedKey: data.wrapped_key,
      passwordSalt: data.password_salt,
      expiresAt: data.expires_at,
      remainingDownloads: data.max_downloads - data.download_count,
      encryptedMeta: file.encrypted_meta,
      chunkSize: file.chunk_size,
      size: file.size_bytes,
    })
  }

  const { data: path, error } = await admin.rpc('claim_transfer_download', { p_id: id })
  if (error || !path) return unavailable()
  const signed = await admin.storage.from('vault-files').createSignedUrl(path as string, SIGNED_URL_SECONDS)
  if (signed.error || !signed.data) return json({ error: 'Download is temporarily unavailable.' }, 502)
  return json({ url: signed.data.signedUrl })
})
