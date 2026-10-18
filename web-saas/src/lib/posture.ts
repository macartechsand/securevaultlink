/**
 * Security posture: a 0–100 score from real signals only, split into categories, plus actionable
 * recommendations. Pure function so it is easy to test and reason about.
 */
export type PostureInput = {
  /** Logins whose passwords can be checked. */
  checkable: number
  weak: number
  reused: number
  exposed: number
  stale: number
  unsafeSites: number
  /** Whether a breach/site check ran in this session. */
  securityCheckRan: boolean
  mfaEnabled: boolean
  recoveryEnabled: boolean
  sessions: number
  exposure: { itemShares: number; itemSharesNoExpiry: number; itemSharesEdit: number; fileShares: number; fileSharesNoExpiry: number; activeTransfers: number } | null
}

export type PostureCategory = { key: string; label: string; score: number; max: number }

export type Recommendation = {
  id: string
  severity: 'high' | 'medium' | 'low'
  title: string
  detail: string
  action?: { label: string; view: string; filter?: string }
}

export type Posture = { score: number; grade: 'Crítica' | 'Atenção' | 'Boa' | 'Excelente'; categories: PostureCategory[]; recommendations: Recommendation[] }

const clamp = (n: number, max: number) => Math.max(0, Math.min(max, n))

export function computePosture(p: PostureInput): Posture {
  const recommendations: Recommendation[] = []
  const categories: PostureCategory[] = []

  // Passwords (40): proportional to healthy logins. Without logins there is nothing to penalize.
  let passwords = 40
  if (p.checkable > 0) {
    const penalty = p.weak + p.reused * 0.5 + p.exposed * 1.5 + p.stale * 0.25
    passwords = clamp(40 * (1 - penalty / p.checkable), 40)
  }
  categories.push({ key: 'passwords', label: 'Senhas', score: passwords, max: 40 })
  if (p.exposed > 0)
    recommendations.push({ id: 'exposed', severity: 'high', title: `Troque ${p.exposed} senha(s) vazada(s)`, detail: 'Elas aparecem em vazamentos conhecidos e podem ser usadas por atacantes.', action: { label: 'Ver senhas vazadas', view: 'vault', filter: 'exposed' } })
  if (p.weak > 0)
    recommendations.push({ id: 'weak', severity: 'medium', title: `Fortaleça ${p.weak} senha(s) fraca(s)`, detail: 'Use o gerador para criar senhas longas e únicas.', action: { label: 'Ver senhas fracas', view: 'vault', filter: 'weak' } })
  if (p.reused > 0)
    recommendations.push({ id: 'reused', severity: 'medium', title: `Elimine ${p.reused} senha(s) reutilizada(s)`, detail: 'Se um site vazar, todas as contas com a mesma senha ficam expostas.', action: { label: 'Ver reutilizadas', view: 'vault', filter: 'reused' } })
  if (p.stale > 0)
    recommendations.push({ id: 'stale', severity: 'low', title: `${p.stale} senha(s) sem troca há mais de 1 ano`, detail: 'Troque primeiro as de contas importantes (e-mail, banco, trabalho).', action: { label: 'Ver senhas antigas', view: 'vault', filter: 'stale' } })
  if (p.checkable > 0 && !p.securityCheckRan)
    recommendations.push({ id: 'check', severity: 'low', title: 'Rode a verificação de segurança', detail: 'Confere vazamentos (Have I Been Pwned) e sites perigosos (Safe Browsing).', action: { label: 'Verificar agora', view: 'dashboard' } })

  // Account protection (30): MFA 20, recovery key 10.
  const account = (p.mfaEnabled ? 20 : 0) + (p.recoveryEnabled ? 10 : 0)
  categories.push({ key: 'account', label: 'Proteção da conta', score: account, max: 30 })
  if (!p.mfaEnabled)
    recommendations.push({ id: 'mfa', severity: 'high', title: 'Ative a verificação em duas etapas', detail: 'Sem ela, quem descobrir a senha da conta consegue entrar e apagar seus dados.', action: { label: 'Ativar', view: 'settings' } })
  if (!p.recoveryEnabled)
    recommendations.push({ id: 'recovery', severity: 'medium', title: 'Ative a chave de recuperação', detail: 'Sem ela, esquecer a senha mestra significa perder o cofre para sempre.', action: { label: 'Ativar', view: 'settings' } })

  // Web threats (15): unsafe saved sites.
  const web = clamp(15 - p.unsafeSites * 5, 15)
  categories.push({ key: 'web', label: 'Sites salvos', score: web, max: 15 })
  if (p.unsafeSites > 0)
    recommendations.push({ id: 'unsafe', severity: 'high', title: `${p.unsafeSites} site(s) perigoso(s) no cofre`, detail: 'O Google Safe Browsing marcou esses endereços como maliciosos. Não entre neles.', action: { label: 'Ver sites', view: 'vault', filter: 'unsafe' } })

  // Sharing exposure (10).
  let sharing = 10
  if (p.exposure) {
    const noExpiry = p.exposure.itemSharesNoExpiry + p.exposure.fileSharesNoExpiry
    sharing = clamp(10 - noExpiry * 2 - p.exposure.itemSharesEdit * 0.5 - Math.max(0, p.exposure.activeTransfers - 3), 10)
    if (noExpiry > 0)
      recommendations.push({ id: 'no-expiry', severity: 'low', title: `${noExpiry} compartilhamento(s) sem expiração`, detail: 'Revise quem ainda precisa de acesso e defina prazos.', action: { label: 'Revisar', view: 'vault', filter: 'shared-by-me' } })
  }
  categories.push({ key: 'sharing', label: 'Compartilhamentos', score: sharing, max: 10 })

  // Sessions (5).
  const sessions = p.sessions <= 3 ? 5 : p.sessions <= 6 ? 3 : 1
  categories.push({ key: 'sessions', label: 'Sessões ativas', score: sessions, max: 5 })
  if (p.sessions > 3)
    recommendations.push({ id: 'sessions', severity: 'low', title: `${p.sessions} sessões ativas`, detail: 'Encerre as sessões de dispositivos que você não reconhece ou não usa mais.', action: { label: 'Ver sessões', view: 'settings' } })

  const score = Math.round(categories.reduce((sum, c) => sum + c.score, 0))
  const grade = score >= 90 ? 'Excelente' : score >= 70 ? 'Boa' : score >= 50 ? 'Atenção' : 'Crítica'
  const order = { high: 0, medium: 1, low: 2 }
  recommendations.sort((a, b) => order[a.severity] - order[b.severity])
  return { score, grade, categories, recommendations }
}

/** Short, human description of a browser user agent (no external library). */
export function describeUserAgent(ua: string | null | undefined) {
  if (!ua) return 'Dispositivo desconhecido'
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /node|undici|supabase/i.test(ua) ? 'Script / API' : 'Navegador'
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad|iOS/.test(ua) ? 'iOS' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : ''
  return os ? `${browser} · ${os}` : browser
}
