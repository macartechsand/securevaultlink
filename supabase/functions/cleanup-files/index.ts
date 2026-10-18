// Supabase Edge Function: removes expired transfers, expired shares, abandoned/rejected uploads,
// and audit events older than 365 days.
// Intended to run on a schedule (e.g. hourly via Supabase Cron calling this URL).
// Protected by a shared secret header, not by user JWT.
//
// Deploy:  supabase functions deploy cleanup-files --no-verify-jwt
// Secret:  supabase secrets set CLEANUP_SECRET=<long random value>
// Call:    POST with header  x-cleanup-secret: <CLEANUP_SECRET>
import { createClient } from 'npm:@supabase/supabase-js@2'

const BATCH = 100

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('CLEANUP_SECRET')
  if (!secret || secret.length < 32) return new Response('cleanup not configured', { status: 503 })
  if (req.method !== 'POST' || !safeEqual(req.headers.get('x-cleanup-secret') ?? '', secret)) {
    return new Response('forbidden', { status: 403 })
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })
  const now = new Date()
  const staleUpload = new Date(now.getTime() - 60 * 60 * 1000).toISOString()

  const targets = new Map<string, string>() // file id -> storage path
  const add = (rows: { id: string; storage_path: string }[] | null) => rows?.forEach((r) => targets.set(r.id, r.storage_path))

  // Expired transfer files.
  add((await admin.from('vault_files').select('id, storage_path').eq('kind', 'transfer').lte('expires_at', now.toISOString()).limit(BATCH)).data)
  // Rejected uploads and uploads never finalized within an hour.
  add((await admin.from('vault_files').select('id, storage_path').eq('status', 'rejected').limit(BATCH)).data)
  add((await admin.from('vault_files').select('id, storage_path').eq('status', 'pending').lte('created_at', staleUpload).limit(BATCH)).data)
  // Transfers that are used up or revoked: remove their files too.
  const spent = (await admin.from('transfers').select('file_id, max_downloads, download_count, revoked').limit(1000)).data ?? []
  const spentIds = spent.filter((t) => t.revoked || t.download_count >= t.max_downloads).map((t) => t.file_id)
  if (spentIds.length) {
    add((await admin.from('vault_files').select('id, storage_path').eq('kind', 'transfer').in('id', spentIds.slice(0, BATCH))).data)
  }

  // Expired user-to-user shares (recipients already lose access at expiry through RLS).
  const sharesRemoved = (await admin.from('file_shares').delete().lte('expires_at', now.toISOString()).select('id')).data?.length ?? 0
  const itemSharesRemoved = (await admin.from('item_shares').delete().lte('expires_at', now.toISOString()).select('id')).data?.length ?? 0
  // Audit retention: 365 days.
  const auditCutoff = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString()
  await admin.from('audit_events').delete().lt('created_at', auditCutoff)

  let removed = 0
  const entries = [...targets.entries()]
  for (let i = 0; i < entries.length; i += BATCH) {
    const chunk = entries.slice(i, i + BATCH)
    const { error } = await admin.storage.from('vault-files').remove(chunk.map(([, path]) => path))
    if (error) continue // keep rows so the next run retries
    await admin.from('vault_files').delete().in('id', chunk.map(([id]) => id))
    removed += chunk.length
  }

  // Heartbeat for the admin health panel (no user data).
  await admin.from('audit_events').insert({ user_id: null, event: 'system.cleanup', source: 'server', details: { removed, sharesRemoved, itemSharesRemoved } })

  return new Response(JSON.stringify({ removed, sharesRemoved, itemSharesRemoved }), { headers: { 'Content-Type': 'application/json' } })
})
