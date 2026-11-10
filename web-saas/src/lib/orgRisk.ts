/**
 * Company risk panel (9.7): turns each member's numeric posture into a risk level and the organization
 * summary. Pure functions; input is only numbers the members' devices reported.
 */
import { csvCell } from './evidenceReport';

export type RiskInput = {
  email: string | null;
  role: string;
  mfa: boolean;
  has_vault: boolean;
  recovery: boolean;
  reported_at: string | null;
  last_sign_in_at: string | null;
  score: number | null;
  items: number | null;
  weak: number | null;
  reused: number | null;
  exposed: number | null;
  rotation_due: number | null;
  unsafe_sites: number | null;
};

export type RiskLevel = 'critical' | 'high' | 'medium' | 'low' | 'unknown';

export const RISK_LABEL: Record<RiskLevel, string> = {
  critical: 'Crítico',
  high: 'Alto',
  medium: 'Médio',
  low: 'Baixo',
  unknown: 'Sem dados',
};

/** Days without a posture report after which the member's numbers are considered stale. */
export const STALE_REPORT_DAYS = 14;

export function memberRisk(m: RiskInput, now = Date.now()): { level: RiskLevel; reasons: string[] } {
  const reasons: string[] = [];
  if (!m.has_vault) return { level: 'unknown', reasons: ['Ainda não criou o cofre'] };
  if (m.score === null || !m.reported_at) return { level: 'unknown', reasons: ['Não compartilha métricas (ou o app ainda não enviou)'] };
  const exposed = m.exposed ?? 0;
  const unsafe = m.unsafe_sites ?? 0;
  if (exposed > 0) reasons.push(`${exposed} senha(s) vazada(s)`);
  if (unsafe > 0) reasons.push(`${unsafe} site(s) perigoso(s)`);
  if (!m.mfa) reasons.push('Sem MFA');
  if ((m.reused ?? 0) > 0) reasons.push(`${m.reused} senha(s) reutilizada(s)`);
  if ((m.weak ?? 0) > 0) reasons.push(`${m.weak} senha(s) fraca(s)`);
  if ((m.rotation_due ?? 0) > 0) reasons.push(`${m.rotation_due} troca(s) vencida(s)`);
  if (!m.recovery) reasons.push('Sem chave de recuperação');
  if (now - Date.parse(m.reported_at) > STALE_REPORT_DAYS * 86_400_000) reasons.push(`Dados com mais de ${STALE_REPORT_DAYS} dias`);

  let level: RiskLevel = 'low';
  if (exposed > 0 || unsafe > 0 || m.score < 40) level = 'critical';
  else if (!m.mfa || m.score < 60 || (m.reused ?? 0) >= 3) level = 'high';
  else if (m.score < 80 || (m.weak ?? 0) > 0 || (m.reused ?? 0) > 0 || (m.rotation_due ?? 0) > 0) level = 'medium';
  return { level, reasons };
}

export function orgSummary(rows: RiskInput[], now = Date.now()) {
  const levels = rows.map((r) => memberRisk(r, now).level);
  const scored = rows.filter((r) => r.score !== null);
  return {
    members: rows.length,
    averageScore: scored.length ? Math.round(scored.reduce((s, r) => s + (r.score ?? 0), 0) / scored.length) : null,
    mfaPercent: rows.length ? Math.round((rows.filter((r) => r.mfa).length / rows.length) * 100) : 0,
    exposed: rows.reduce((s, r) => s + (r.exposed ?? 0), 0),
    reused: rows.reduce((s, r) => s + (r.reused ?? 0), 0),
    rotationDue: rows.reduce((s, r) => s + (r.rotation_due ?? 0), 0),
    withoutRecovery: rows.filter((r) => r.has_vault && !r.recovery).length,
    critical: levels.filter((l) => l === 'critical').length,
    high: levels.filter((l) => l === 'high').length,
    unknown: levels.filter((l) => l === 'unknown').length,
  };
}

/** Prioritised actions for the admin (no member names: the table shows who). */
export function orgActions(rows: RiskInput[], now = Date.now()): string[] {
  const s = orgSummary(rows, now);
  const out: string[] = [];
  if (s.exposed > 0) out.push(`Trocar ${s.exposed} senha(s) vazada(s) hoje (membros em "Crítico").`);
  if (s.mfaPercent < 100) out.push(`Exigir MFA: ${100 - s.mfaPercent}% dos membros ainda não ativaram.`);
  if (s.reused > 0) out.push(`Eliminar ${s.reused} reutilização(ões) de senha (gerador do cofre).`);
  if (s.rotationDue > 0) out.push(`Concluir ${s.rotationDue} troca(s) vencida(s) na fila de Rotação.`);
  if (s.withoutRecovery > 0) out.push(`${s.withoutRecovery} membro(s) sem chave de recuperação: risco de perder o cofre.`);
  if (s.unknown > 0) out.push(`${s.unknown} membro(s) sem dados: peça para abrir o app (ou ligar "compartilhar métricas").`);
  return out;
}

export function riskCsv(rows: RiskInput[], now = Date.now()): string {
  const head = ['email', 'papel', 'risco', 'nota', 'itens', 'fracas', 'reutilizadas', 'vazadas', 'trocas_vencidas', 'mfa', 'recuperacao', 'ultimo_relatorio', 'motivos'];
  const lines = rows.map((r) => {
    const { level, reasons } = memberRisk(r, now);
    return [r.email, r.role, RISK_LABEL[level], r.score, r.items, r.weak, r.reused, r.exposed, r.rotation_due, r.mfa ? 'sim' : 'não', r.recovery ? 'sim' : 'não', r.reported_at, reasons.join('; ')]
      .map(csvCell)
      .join(',');
  });
  return [head.join(','), ...lines].join('\r\n');
}
