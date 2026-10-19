import { useEffect, useState } from 'react';
import { friendlyError } from '../../lib/messages';
import { type Compliance, fetchCompliance } from '../../services/adminService';

type Rule = { label: string; detail: string; evaluate: (v: number, users: number) => 'pass' | 'warn' | 'fail' };

const RULES: Record<string, Rule> = {
  privileged_without_mfa: { label: 'Contas privilegiadas sem MFA', detail: 'Deve ser zero (bloqueadas pelo painel, mas é um risco).', evaluate: (v) => (v === 0 ? 'pass' : 'fail') },
  owners: { label: 'Administradores master', detail: 'Exatamente 1 recomendado.', evaluate: (v) => (v === 1 ? 'pass' : v === 0 ? 'fail' : 'warn') },
  users_without_mfa: { label: 'Usuários sem MFA', detail: 'Meta: todos com segundo fator.', evaluate: (v, u) => (v === 0 ? 'pass' : v / Math.max(u, 1) > 0.5 ? 'fail' : 'warn') },
  mfa_required_not_enrolled: { label: 'MFA exigido e não ativado', detail: 'Usuários bloqueados até ativar o segundo fator.', evaluate: (v) => (v === 0 ? 'pass' : 'warn') },
  vaults_without_recovery: { label: 'Cofres sem chave de recuperação', detail: 'Risco de perda permanente de dados.', evaluate: (v) => (v === 0 ? 'pass' : 'warn') },
  kdf_below_policy: { label: 'Cofres com KDF abaixo da política', detail: 'PBKDF2 com menos de 600 mil iterações.', evaluate: (v) => (v === 0 ? 'pass' : 'fail') },
  legacy_entries_v1: { label: 'Itens no formato antigo (v1)', detail: 'Migram na próxima edição; não podem ser compartilhados.', evaluate: (v) => (v === 0 ? 'pass' : 'warn') },
  shares_without_expiry: { label: 'Compartilhamentos sem expiração', detail: 'Revise acessos permanentes.', evaluate: (v) => (v === 0 ? 'pass' : 'warn') },
  inactive_90d: { label: 'Contas inativas há mais de 90 dias', detail: 'Considere desativar.', evaluate: (v) => (v === 0 ? 'pass' : 'warn') },
  unconfirmed_emails: { label: 'E-mails não confirmados', detail: 'Contas que não concluíram o cadastro.', evaluate: (v) => (v === 0 ? 'pass' : 'warn') },
  suspended: { label: 'Contas suspensas', detail: 'Informativo.', evaluate: () => 'pass' },
  exposed_passwords: { label: 'Senhas vazadas (somadas)', detail: 'Do resumo enviado pelos apps; oriente a troca.', evaluate: (v) => (v === 0 ? 'pass' : 'fail') },
  rotation_overdue: { label: 'Trocas programadas vencidas', detail: 'Do resumo enviado pelos apps.', evaluate: (v) => (v === 0 ? 'pass' : 'warn') },
  failed_unlocks_24h: { label: 'Desbloqueios falhos (24 h)', detail: 'Picos podem indicar tentativa de adivinhação.', evaluate: (v) => (v < 10 ? 'pass' : v < 50 ? 'warn' : 'fail') },
  cleanup_last_run_hours: { label: 'Horas desde a última limpeza', detail: 'Deve rodar de hora em hora (Cron).', evaluate: (v) => (v === null ? 'fail' : v <= 2 ? 'pass' : v <= 24 ? 'warn' : 'fail') },
  posture_reporting_users: { label: 'Usuários enviando métricas', detail: 'Cobertura dos insights de suporte.', evaluate: (v, u) => (v >= u * 0.8 ? 'pass' : 'warn') },
};

const BADGE = { pass: 'badge--ok', warn: 'badge--warn', fail: 'badge--danger' } as const;
const LABEL = { pass: 'OK', warn: 'Atenção', fail: 'Falha' } as const;

export function ComplianceTab() {
  const [data, setData] = useState<Compliance | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchCompliance()
      .then(setData)
      .catch((e) => setError(friendlyError(e)));
  }, []);

  if (error) return <div className="alert alert--error">{error}</div>;
  if (!data) return <p className="muted">Carregando…</p>;

  const rows = data.checks.map((c) => {
    const rule = RULES[c.key];
    const value = c.value === null ? null : Number(c.value);
    const status = rule ? rule.evaluate(value as number, data.users) : 'warn';
    return { ...c, rule, value, status };
  });
  const totals = { pass: rows.filter((r) => r.status === 'pass').length, warn: rows.filter((r) => r.status === 'warn').length, fail: rows.filter((r) => r.status === 'fail').length };

  return (
    <section className="card">
      <div className="card__header">
        <div>
          <p className="eyebrow">Conformidade</p>
          <h2>Controles da plataforma</h2>
          <p className="subtle">Calculado com metadados do servidor e com os resumos numéricos enviados pelos apps. Nenhum conteúdo de cofre é usado.</p>
        </div>
        <div className="badges">
          <span className="badge badge--ok">{totals.pass} OK</span>
          <span className="badge badge--warn">{totals.warn} atenção</span>
          <span className="badge badge--danger">{totals.fail} falha</span>
        </div>
      </div>
      <ul className="list">
        {rows.map((r) => (
          <li key={r.key}>
            <span>
              <strong>{r.rule?.label ?? r.key}</strong>
              <span className="subtle block">{r.rule?.detail}</span>
            </span>
            <span className="row nowrap">
              <span className="mono">{r.value === null ? '—' : Math.round(r.value * 10) / 10}</span>
              <span className={`badge ${BADGE[r.status]}`}>{LABEL[r.status]}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
