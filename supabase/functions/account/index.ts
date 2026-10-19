// Supabase Edge Function: self-service account deletion (LGPD right to erasure).
// Deletes the caller's stored objects (Supabase Storage and R2) and then the auth user; every
// public table row cascades from auth.users. Requires an aal2 session when the user has MFA.
// An anonymous "account.deleted" event is kept for operational statistics (no user id or e-mail).
//
// Deploy (JWT verification ON):  supabase functions deploy account
import { createClient } from 'npm:@supabase/supabase-js@2'
import { r2Configured, r2Fetch } from '../_shared/r2.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

function jwtClaims(authHeader: string): Record<string, unknown> {
  try {
    const payload = authHeader.replace(/^Bearer\s+/i, '').split('.')[1]
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
  } catch {
    return {}
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const authHeader = req.headers.get('Authorization') ?? ''
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })
  const { data: userData } = await caller.auth.getUser()
  const user = userData.user
  if (!user) return json({ error: 'unauthorized' }, 401)

  let body: { action?: string; confirm?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid request' }, 400)
  }
  if (body.action !== 'delete' || body.confirm !== 'EXCLUIR') return json({ error: 'Confirmação inválida.' }, 400)

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  // MFA users must be in an MFA-verified session (the gateway already verified the JWT signature).
  const { data: factors } = await admin.auth.admin.mfa.listFactors({ userId: user.id })
  const hasMfa = (factors?.factors ?? []).some((f) => f.status === 'verified')
  if (hasMfa && jwtClaims(authHeader).aal !== 'aal2') return json({ error: 'Entre com a verificação em duas etapas para excluir a conta.' }, 403)

  const { data: role } = await admin.from('app_admins').select('role').eq('user_id', user.id).maybeSingle()
  if (role?.role === 'owner') return json({ error: 'O administrador master não pode se excluir por aqui. Transfira o papel antes.' }, 409)

  // 1) Stored objects (rows go away with the cascade, objects would not).
  const { data: files } = await admin.from('vault_files').select('storage_path, storage_backend').eq('owner_id', user.id)
  const supabasePaths = (files ?? []).filter((f) => f.storage_backend !== 'r2').map((f) => f.storage_path)
  for (let i = 0; i < supabasePaths.length; i += 100) {
    const { error } = await admin.storage.from('vault-files').remove(supabasePaths.slice(i, i + 100))
    if (error) return json({ error: 'Não foi possível apagar os arquivos. Tente novamente.' }, 502)
  }
  if (r2Configured) {
    for (const f of (files ?? []).filter((x) => x.storage_backend === 'r2')) {
      const res = await r2Fetch(f.storage_path, 'DELETE').catch(() => null)
      if (!res || (!res.ok && res.status !== 404)) return json({ error: 'Não foi possível apagar os arquivos. Tente novamente.' }, 502)
    }
  }

  // 2) The account itself (cascades to every table). Then an anonymous statistic.
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id)
  if (deleteError) return json({ error: 'Não foi possível excluir a conta. Tente novamente.' }, 502)
  await admin.from('beta_allowlist').delete().eq('email', (user.email ?? '').toLowerCase())
  await admin.from('audit_events').insert({ user_id: null, event: 'account.deleted', source: 'server', details: { files: files?.length ?? 0 } })
  return json({ ok: true })
})
