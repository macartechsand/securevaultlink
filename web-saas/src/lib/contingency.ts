/**
 * Contingency readiness: is the user prepared to get back in (or get their data out) when something
 * goes wrong, such as a forgotten master password, a lost phone or the service being down?
 *
 * Pure function plus device-local dates (when the recovery key was last tested, the last encrypted
 * export, whether the offline reader was saved). Only dates are stored, never keys or contents.
 * See docs/product/contingency-plan.md.
 */

export const RECOVERY_TEST_MAX_DAYS = 180
export const EXPORT_MAX_DAYS = 90
const DAY_MS = 86_400_000

export type CheckState = 'ok' | 'warn' | 'missing'
export type ContingencyCheck = { id: 'recovery' | 'recovery-test' | 'mfa' | 'export' | 'reader'; state: CheckState; title: string; detail: string }

export type ContingencyInput = {
  recoveryEnabled: boolean
  recoveryTestedAt: string | null
  mfaEnabled: boolean
  lastExportAt: string | null
  readerSavedAt: string | null
  now?: number
}

const ageDays = (iso: string | null, now: number) => {
  const t = iso ? Date.parse(iso) : NaN
  return Number.isFinite(t) ? Math.floor((now - t) / DAY_MS) : null
}

export function contingencyChecks(p: ContingencyInput): { checks: ContingencyCheck[]; ready: boolean } {
  const now = p.now ?? Date.now()
  const checks: ContingencyCheck[] = []

  checks.push(
    p.recoveryEnabled
      ? { id: 'recovery', state: 'ok', title: 'Chave de recuperação ativada', detail: 'Se esquecer a senha mestra, você define outra com ela.' }
      : { id: 'recovery', state: 'missing', title: 'Sem chave de recuperação', detail: 'Hoje, esquecer a senha mestra significa perder o cofre. Ative a chave em "Chave de recuperação".' },
  )

  if (p.recoveryEnabled) {
    const age = ageDays(p.recoveryTestedAt, now)
    checks.push(
      age === null
        ? { id: 'recovery-test', state: 'warn', title: 'Chave de recuperação nunca testada', detail: 'Teste abaixo: confirma que a chave guardada é a certa, sem mudar nada.' }
        : age > RECOVERY_TEST_MAX_DAYS
          ? { id: 'recovery-test', state: 'warn', title: `Chave testada há ${age} dias`, detail: 'Teste de novo para ter certeza de que ela ainda está onde você guardou.' }
          : { id: 'recovery-test', state: 'ok', title: 'Chave de recuperação testada', detail: `Último teste há ${age} dia(s) neste aparelho.` },
    )
  }

  checks.push(
    p.mfaEnabled
      ? { id: 'mfa', state: 'ok', title: 'Verificação em duas etapas ativa', detail: 'Faça backup do app autenticador (ou cadastre-o em dois aparelhos) para não ficar sem acesso se perder o celular.' }
      : { id: 'mfa', state: 'missing', title: 'Sem verificação em duas etapas', detail: 'Quem descobrir a senha da conta entra nela. Ative em "Verificação em duas etapas".' },
  )

  const exportAge = ageDays(p.lastExportAt, now)
  checks.push(
    exportAge === null
      ? { id: 'export', state: 'missing', title: 'Nenhum backup cifrado neste aparelho', detail: 'Exporte em "Backup e importação" e guarde o arquivo e a senha em lugares diferentes.' }
      : exportAge > EXPORT_MAX_DAYS
        ? { id: 'export', state: 'warn', title: `Último backup há ${exportAge} dias`, detail: 'Exporte de novo para incluir o que mudou.' }
        : { id: 'export', state: 'ok', title: 'Backup cifrado recente', detail: `Exportado há ${exportAge} dia(s).` },
  )

  checks.push(
    p.readerSavedAt
      ? { id: 'reader', state: 'ok', title: 'Leitor offline salvo', detail: 'Abre seus backups mesmo se o SecureLink estiver fora do ar.' }
      : { id: 'reader', state: 'warn', title: 'Leitor offline não salvo', detail: 'Baixe o leitor e guarde junto dos backups: ele abre o arquivo sem internet e sem o SecureLink.' },
  )

  return { checks, ready: checks.every((c) => c.state === 'ok' || c.id === 'reader') }
}

/* ---------------------------------------------------------------- device-local dates */

/** Fired after a mark changes, so the contingency card refreshes. */
export const CONTINGENCY_EVENT = 'sv-contingency'

type Mark = 'recoveryTestedAt' | 'lastExportAt' | 'readerSavedAt'
const key = (name: Mark, userId: string) => `sv.${name}.${userId}`

export function readMark(name: Mark, userId: string): string | null {
  try {
    return localStorage.getItem(key(name, userId))
  } catch {
    return null
  }
}

export function setMark(name: Mark, userId: string, now = Date.now()) {
  try {
    localStorage.setItem(key(name, userId), new Date(now).toISOString())
    window.dispatchEvent(new Event(CONTINGENCY_EVENT))
  } catch {
    /* storage unavailable: the check just shows as pending */
  }
}
