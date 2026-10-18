// Supabase Edge Function: administrator actions that need the Auth admin API.
// Access: caller must be in public.app_admins AND have an MFA-verified (aal2) session. Checked with
// the caller's own JWT (my_admin_status) before the service role is used. Every action is audited.
// Admins never receive vault contents: these actions only touch auth metadata.
//
// Deploy (JWT verification ON, the default):  supabase functions deploy admin
import { createClient } from 'npm:@supabase/supabase-js@2'

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? '*'
const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ACTIONS = ['health', 'reset_mfa', 'suspend', 'unsuspend', 'invite_link', 'recovery_link'] as const
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

// Where sign-in links may send people back to (comma-separated origins). Falls back to the Site URL.
const APP_ORIGINS = (Deno.env.get('APP_ORIGINS') ?? '').split(',').map((o) => o.trim()).filter(Boolean)
function redirectFor(requested: unknown): string | undefined {
  if (typeof requested !== 'string') return undefined
  try {
    const origin = new URL(requested).origin
    return APP_ORIGINS.includes(origin) ? `${origin}/` : undefined
  } catch {
    return undefined
  }
}
type Action = (typeof ACTIONS)[number]

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  })
  const { data: userData } = await caller.auth.getUser()
  if (!userData.user) return json({ error: 'unauthorized' }, 401)
  const { data: status } = await caller.rpc('my_admin_status')
  const me = (status as { role: string; mfa_ok: boolean }[] | null)?.[0]
  if (!me) return json({ error: 'Admin access required' }, 403)
  if (!me.mfa_ok) return json({ error: 'Admins must sign in with two-factor authentication' }, 403)

  let action: Action
  let target = ''
  let email = ''
  let redirectTo: string | undefined
  try {
    const body = await req.json()
    action = body.action
    target = String(body.userId ?? '')
    email = String(body.email ?? '').trim().toLowerCase()
    redirectTo = redirectFor(body.redirectTo)
    if (!ACTIONS.includes(action)) throw new Error('bad action')
    if (action === 'invite_link') {
      if (!EMAIL.test(email)) throw new Error('bad email')
    } else if (action !== 'health' && !UUID.test(target)) throw new Error('bad user')
  } catch {
    return json({ error: 'invalid request' }, 400)
  }
  if (action !== 'health' && me.role !== 'admin') return json({ error: 'This action requires the admin role' }, 403)
  if (target === userData.user.id && action === 'suspend') return json({ error: 'You cannot suspend yourself' }, 400)

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const audit = (event: string, details: Record<string, unknown> = {}) =>
    admin.from('audit_events').insert({ user_id: target, actor_id: userData.user!.id, event, target_type: 'user', target_id: target, details })

  // One-time sign-in links, generated WITHOUT sending e-mail (for when SMTP is not configured).
  // The admin delivers them through another channel. They are credentials: shown once, expire, audited.
  if (action === 'invite_link') {
    // Inviting implies authorizing the address in the closed beta.
    await admin.from('beta_allowlist').upsert({ email, note: 'convite com link', invited_by: userData.user.id }, { onConflict: 'email' })
    const { data, error } = await admin.auth.admin.generateLink({ type: 'invite', email, options: redirectTo ? { redirectTo } : undefined })
    if (error || !data?.properties?.action_link) {
      const msg = error?.message ?? ''
      if (/already|registered|exists/i.test(msg)) return json({ error: 'Este e-mail já tem conta. Use "Gerar link de redefinição" no usuário.' }, 409)
      if (/Database error/i.test(msg)) return json({ error: 'O beta está cheio (limite de contas atingido).' }, 409)
      return json({ error: 'Não foi possível gerar o convite.' }, 502)
    }
    target = data.user?.id ?? ''
    await audit('admin.invite_link_created', { email })
    return json({ link: data.properties.action_link, email })
  }

  if (action === 'recovery_link') {
    const { data: u, error: userError } = await admin.auth.admin.getUserById(target)
    if (userError || !u.user?.email) return json({ error: 'Usuário não encontrado.' }, 404)
    const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email: u.user.email, options: redirectTo ? { redirectTo } : undefined })
    if (error || !data?.properties?.action_link) return json({ error: 'Não foi possível gerar o link.' }, 502)
    await audit('admin.recovery_link_created')
    return json({ link: data.properties.action_link, email: u.user.email })
  }

  if (action === 'health') {
    const bucket = await admin.storage.getBucket('vault-files')
    return json({
      checks: {
        database: true,
        bucket_exists: !bucket.error,
        bucket_private: bucket.data ? bucket.data.public === false : null,
        safe_browsing_key: Boolean(Deno.env.get('SAFE_BROWSING_API_KEY')),
        cleanup_secret: (Deno.env.get('CLEANUP_SECRET') ?? '').length >= 32,
      },
    })
  }

  if (action === 'reset_mfa') {
    const { data, error } = await admin.auth.admin.mfa.listFactors({ userId: target })
    if (error) return json({ error: 'Could not list factors' }, 502)
    let removed = 0
    for (const f of data?.factors ?? []) {
      const res = await admin.auth.admin.mfa.deleteFactor({ userId: target, id: f.id })
      if (!res.error) removed += 1
    }
    await audit('admin.mfa_reset', { factors_removed: removed })
    return json({ ok: true, removed })
  }

  // ~100 years = indefinite suspension; 'none' lifts it.
  const { error } = await admin.auth.admin.updateUserById(target, { ban_duration: action === 'suspend' ? '876000h' : 'none' })
  if (error) return json({ error: 'Could not update the user' }, 502)
  // Suspension also ends existing sessions (admin_revoke_sessions re-checks the caller's admin rights).
  if (action === 'suspend') await caller.rpc('admin_revoke_sessions', { p_user: target })
  await audit(action === 'suspend' ? 'admin.user_suspended' : 'admin.user_unsuspended')
  return json({ ok: true })
})
