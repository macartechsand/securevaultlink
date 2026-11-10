/**
 * Credential-rotation evidence report (Premium, docs/product/innovation.md 9.4).
 * Built on the device from data the user can already see: no passwords, no URLs, no notes.
 * Titles can be replaced by codes (ITEM-001…) for sharing with auditors.
 */
import { RISK_LABELS, type ItemHealth } from './itemHealth'
import { passwordAgeDays, typeLabel } from './items'
import type { Deadline } from './rotationDeadlines'
import type { VaultItem } from '../state/itemOps'

export type RotationAuditEvent = { event: string; createdAt: string; details: Record<string, unknown> }

export type EvidenceInput = {
  items: VaultItem[]
  health: ItemHealth
  deadlines: Deadline[]
  events: RotationAuditEvent[]
  account: string
  pseudonymize: boolean
  now?: number
}

/** Spreadsheet-safe CSV cell: quotes, and neutralizes formulas (=, +, -, @, tab, CR) against CSV injection. */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[";\n\r,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const date = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '')

export const EVIDENCE_COLUMNS = [
  'item',
  'tipo',
  'ultima_troca_senha',
  'idade_senha_dias',
  'riscos_atuais',
  'prazo',
  'situacao',
  'troca_programada_dias',
  'validade',
  'ultima_rotacao_automatica',
  'resultado_rotacao',
  'nova_credencial_verificada',
] as const

export function buildEvidenceCsv(p: EvidenceInput): string {
  const now = p.now ?? Date.now()
  const deadlineById = new Map(p.deadlines.map((d) => [d.item.id, d]))
  const lastRotation = new Map<string, RotationAuditEvent>()
  for (const e of p.events) {
    if (e.event !== 'rotation.succeeded' && e.event !== 'rotation.failed') continue
    const id = typeof e.details.item === 'string' ? e.details.item : null
    if (!id) continue
    const prev = lastRotation.get(id)
    if (!prev || prev.createdAt < e.createdAt) lastRotation.set(id, e)
  }
  const own = p.items.filter((i) => i.access !== 'view').sort((a, b) => a.data.title.localeCompare(b.data.title, 'pt-BR'))
  const lines: string[] = [
    `# Relatório de evidências de troca de credenciais · SecureLink Vault`,
    `# Conta: ${p.account} · Gerado em: ${new Date(now).toISOString()} · Itens: ${own.length}`,
    `# Sem senhas, URLs ou notas.${p.pseudonymize ? ' Títulos substituídos por códigos.' : ''}`,
    EVIDENCE_COLUMNS.join(','),
  ]
  own.forEach((item, index) => {
    const risks = p.health.risksById.get(item.id) ?? []
    const deadline = deadlineById.get(item.id)
    const rotation = lastRotation.get(item.id)
    const hasPassword = item.data.type === 'login' || item.data.type === 'secret'
    lines.push(
      [
        p.pseudonymize ? `ITEM-${String(index + 1).padStart(3, '0')}` : item.data.title,
        typeLabel(item.data.type),
        hasPassword ? date(item.data.passwordUpdatedAt ?? item.createdAt) : '',
        hasPassword ? passwordAgeDays(item.data, item.createdAt, now) : '',
        risks.map((r) => RISK_LABELS[r]).join('; '),
        deadline ? date(new Date(deadline.dueAt).toISOString()) : '',
        deadline ? (deadline.daysLeft < 0 ? 'vencido' : 'no prazo') : 'sem pendência',
        item.data.rotationIntervalDays || '',
        item.data.expiresOn,
        rotation ? date(rotation.createdAt) : '',
        rotation ? (rotation.event === 'rotation.succeeded' ? 'sucesso' : 'falha') : '',
        rotation && rotation.event === 'rotation.succeeded' ? (rotation.details.verified === true ? 'sim' : 'não') : '',
      ]
        .map(csvCell)
        .join(','),
    )
  })
  return lines.join('\r\n') + '\r\n'
}
