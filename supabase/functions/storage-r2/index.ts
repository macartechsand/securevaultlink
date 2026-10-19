// Supabase Edge Function: Cloudflare R2 storage backend (premium plan).
// Files are already encrypted in the browser; R2 only ever receives ciphertext.
// Access is checked with the CALLER's JWT (RLS on vault_files) before any URL is signed.
//
// Secrets:  R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
// Deploy:   supabase functions deploy storage-r2        (JWT verification ON)
// R2 bucket CORS: allow PUT and GET from the app origin, header Content-Type.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { r2Configured as configured, r2Fetch, r2Presign as presign } from '../_shared/r2.ts'

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? '*'
const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const UPLOAD_SECONDS = 300
const DOWNLOAD_SECONDS = 60

type FileRow = { id: string; owner_id: string; status: string; size_bytes: number; storage_path: string; storage_backend: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  let action = ''
  let fileId = ''
  try {
    const body = await req.json()
    action = String(body.action ?? '')
    fileId = String(body.fileId ?? '')
  } catch {
    return json({ error: 'invalid request' }, 400)
  }
  if (action === 'status') return json({ available: configured })
  if (!configured) return json({ error: 'R2 storage is not configured' }, 503)
  if (!['upload-url', 'finalize', 'download-url', 'delete'].includes(action) || !UUID.test(fileId)) {
    return json({ error: 'invalid request' }, 400)
  }

  const url = Deno.env.get('SUPABASE_URL')!
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  })
  const { data: userData } = await caller.auth.getUser()
  if (!userData.user) return json({ error: 'unauthorized' }, 401)

  // RLS decides visibility: owners see their files, recipients see actively shared ones.
  const { data: row } = await caller
    .from('vault_files')
    .select('id, owner_id, status, size_bytes, storage_path, storage_backend')
    .eq('id', fileId)
    .maybeSingle<FileRow>()
  if (!row || row.storage_backend !== 'r2') return json({ error: 'File not found' }, 404)
  const isOwner = row.owner_id === userData.user.id

  if (action === 'download-url') {
    if (row.status !== 'ready') return json({ error: 'File not available' }, 404)
    return json({ url: await presign('GET', row.storage_path, DOWNLOAD_SECONDS) })
  }
  if (!isOwner) return json({ error: 'Only the owner can do this' }, 403)

  if (action === 'upload-url') {
    if (row.status !== 'pending') return json({ error: 'Upload already finalized' }, 409)
    return json({ url: await presign('PUT', row.storage_path, UPLOAD_SECONDS) })
  }

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  if (action === 'finalize') {
    if (row.status !== 'pending') return json({ status: row.status })
    const head = await r2Fetch(row.storage_path, 'HEAD')
    if (!head.ok) return json({ error: 'Upload not found' }, 404)
    const size = Number(head.headers.get('content-length'))
    const status = size === row.size_bytes ? 'ready' : 'rejected'
    if (status === 'rejected') await r2Fetch(row.storage_path, 'DELETE')
    await admin.from('vault_files').update({ status }).eq('id', row.id).eq('status', 'pending')
    return json({ status })
  }

  // delete
  const del = await r2Fetch(row.storage_path, 'DELETE')
  if (!del.ok && del.status !== 404) return json({ error: 'Could not delete the object' }, 502)
  return json({ ok: true })
})
