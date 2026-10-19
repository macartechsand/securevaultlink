// Supabase Edge Function: self-service account actions.
//  - delete       (confirm 'EXCLUIR'): LGPD right to erasure. Deletes the caller's stored objects
//                 (Supabase Storage and R2) and then the auth user; every public table row cascades
//                 from auth.users. An anonymous "account.deleted" event is kept for statistics.
//  - reset_vault  (confirm 'APAGAR COFRE'): forgotten master password without a recovery key. The
//                 vault cannot be decrypted by anyone, so this erases it (profile, items, folders,
//                 files, sharing keys, shares sent and received) and keeps the account, MFA, roles
//                 and preferences; the user then creates a new master password.
// Both require an aal2 session when the user has MFA.
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
  const resetVault = body.action === 'reset_vault' && body.confirm === 'APAGAR COFRE'
  if (!resetVault && (body.action !== 'delete' || body.confirm !== 'EXCLUIR')) return json({ error: 'Confirmação inválida.' }, 400)

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  // MFA users must be in an MFA-verified session (the gateway already verified the JWT signature).
  const { data: factors } = await admin.auth.admin.mfa.listFactors({ userId: user.id })
  const hasMfa = (factors?.factors ?? []).some((f) => f.status === 'verified')
  if (hasMfa && jwtClaims(authHeader).aal !== 'aal2') {
    return json({ error: `Entre com a verificação em duas etapas para ${resetVault ? 'recomeçar o cofre' : 'excluir a conta'}.` }, 403)
  }

  const { data: role } = await admin.from('app_admins').select('role').eq('user_id', user.id).maybeSingle()
  if (!resetVault && role?.role === 'owner') return json({ error: 'O administrador master não pode se excluir por aqui. Transfira o papel antes.' }, 409)

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

  if (resetVault) {
    // 2) Everything encrypted with the old keys. Shares received were sealed to the old key pair,
    //    so they are removed too (the senders can share again). Order: children before parents.
    const steps: [string, string][] = [
      ['item_shares', 'recipient_id'], ['file_shares', 'recipient_id'],
      ['item_shares', 'owner_id'], ['file_shares', 'owner_id'], ['transfers', 'owner_id'],
      ['vault_files', 'owner_id'], ['vault_entries', 'user_id'], ['vault_folders', 'user_id'],
      ['user_keys', 'user_id'], ['posture_snapshots', 'user_id'], ['vault_profiles', 'user_id'],
    ]
    for (const [table, column] of steps) {
      const { error } = await admin.from(table).delete().eq(column, user.id)
      if (error) return json({ error: 'Não foi possível apagar o cofre. Tente novamente.' }, 502)
    }
    await admin.from('audit_events').insert({ user_id: user.id, event: 'vault.reset', source: 'server', details: { files: files?.length ?? 0 } })
    return json({ ok: true })
  }

  // 2) The account itself (cascades to every table). Then an anonymous statistic.
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id)
  if (deleteError) return json({ error: 'Não foi possível excluir a conta. Tente novamente.' }, 502)
  await admin.from('beta_allowlist').delete().eq('email', (user.email ?? '').toLowerCase())
  await admin.from('audit_events').insert({ user_id: null, event: 'account.deleted', source: 'server', details: { files: files?.length ?? 0 } })
  return json({ ok: true })
})
