import { useCallback, useEffect, useState } from 'react';
import { formatBytes, formatDateTime, friendlyError } from '../lib/messages';
import { type AdminOverview, type AdminStatus, ROLE_LABELS, canManage, fetchOverview, systemHealth } from '../services/adminService';
import { BetaAdminTab } from './BetaAdminTab';
import { StatCard } from './StatCard';
import { ComplianceTab } from './admin/ComplianceTab';
import { EventsTab } from './admin/EventsTab';
import { IamUsersTab } from './admin/IamUsersTab';
import { PrivilegedTab } from './admin/PrivilegedTab';
import { Icon } from './ui/Icon';

const pct = (part: unknown, total: unknown) => {
  const t = Number(total) || 0;
  return t ? `${Math.round((Number(part) / t) * 100)}%` : '—';
};

const HEALTH_LABELS: Record<string, string> = {
  database: 'Banco de dados',
  bucket_exists: 'Bucket de arquivos existe',
  bucket_private: 'Bucket de arquivos privado',
  safe_browsing_key: 'Chave do Safe Browsing configurada',
  cleanup_secret: 'Segredo da limpeza configurado',
};

export function AdminView({ status }: { status: NonNullable<AdminStatus> }) {
  const [tab, setTab] = useState<'overview' | 'users' | 'pam' | 'compliance' | 'events' | 'beta' | 'health'>('overview');
  const manage = canManage(status);
  const [error, setError] = useState('');

  if (!status.mfaOk) {
    return (
      <section className="card">
        <h2>Administração</h2>
        <div className="alert alert--warn">
          O painel de administração exige verificação em duas etapas. Ative-a em Configurações, saia e entre novamente
          informando o código.
        </div>
      </section>
    );
  }

  return (
    <div className="stack">
      <div className="alert alert--info">
        Perfil: <strong>{ROLE_LABELS[status.role]}</strong>
        {status.expiresAt && <> · acesso temporário até {formatDateTime(status.expiresAt)}</>}. O painel mostra apenas
        metadados: ninguém, nem administradores, consegue ver o conteúdo dos cofres. Toda ação fica no log de auditoria.
        {!manage && ' Seu perfil é somente leitura.'}
      </div>
      <div className="tabs" role="tablist">
        {(
          [
            ['overview', 'Visão geral'],
            ['users', 'Usuários (IAM)'],
            ['pam', 'Acesso privilegiado (PAM)'],
            ['compliance', 'Conformidade'],
            ['events', 'Eventos'],
            ['beta', 'Beta e limites'],
            ['health', 'Saúde do sistema'],
          ] as const
        ).map(([key, label]) => (
          <button key={key} type="button" role="tab" className={`tab ${tab === key ? 'is-active' : ''}`} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>
      {error && <div className="alert alert--error">{error}</div>}
      {tab === 'overview' && <OverviewTab onError={setError} />}
      {tab === 'users' && <IamUsersTab canAct={manage} />}
      {tab === 'pam' && <PrivilegedTab isOwner={status.role === 'owner'} />}
      {tab === 'compliance' && <ComplianceTab />}
      {tab === 'events' && <EventsTab />}
      {tab === 'beta' && <BetaAdminTab canAct={manage} />}
      {tab === 'health' && <HealthTab onError={setError} />}
    </div>
  );
}

function OverviewTab({ onError }: { onError: (m: string) => void }) {
  const [o, setO] = useState<AdminOverview | null>(null);
  useEffect(() => {
    fetchOverview()
      .then(setO)
      .catch((e) => onError(friendlyError(e)));
  }, [onError]);
  if (!o) return <p className="muted">Carregando…</p>;
  return (
    <div className="stack">
      <section className="grid grid--stats">
        <StatCard label="Usuários" value={String(o.users)} note={`+${o.new_users_7d} em 7 dias`} />
        <StatCard label="Ativos (7 dias)" value={String(o.active_7d)} />
        <StatCard label="Com MFA" value={pct(o.mfa_users, o.users)} note={`${o.mfa_users} usuários`} tone={Number(o.mfa_users) / (Number(o.users) || 1) >= 0.5 ? 'good' : 'bad'} />
        <StatCard label="Com recuperação" value={pct(o.recovery_enabled, o.vaults)} note={`${o.recovery_enabled} cofres`} />
        <StatCard label="Premium" value={String(o.premium_users)} />
        <StatCard label="Itens" value={String(o.items)} />
        <StatCard label="Arquivos" value={String(o.files)} note={formatBytes(Number(o.storage_bytes))} />
        <StatCard label="Transferências ativas" value={String(o.active_transfers)} />
      </section>
      <section className="card">
        <h2>Sinais operacionais (24 h)</h2>
        <ul className="list">
          <li>
            <span>Eventos de auditoria</span>
            <strong>{o.events_24h}</strong>
          </li>
          <li>
            <span>Tentativas de desbloqueio falhas</span>
            <span className={`badge ${Number(o.failed_unlocks_24h) > 20 ? 'badge--danger' : ''}`}>{o.failed_unlocks_24h}</span>
          </li>
          <li>
            <span>Erros do aplicativo informados</span>
            <span className={`badge ${Number(o.client_errors_24h) > 0 ? 'badge--warn' : ''}`}>{o.client_errors_24h}</span>
          </li>
          <li>
            <span>Envios pendentes há mais de 1 h / rejeitados</span>
            <span>
              {o.pending_uploads} / {o.rejected_uploads}
            </span>
          </li>
          <li>
            <span>Arquivos de transferência vencidos aguardando limpeza</span>
            <span className={`badge ${Number(o.expired_transfer_files) > 0 ? 'badge--warn' : ''}`}>{o.expired_transfer_files}</span>
          </li>
          <li>
            <span>Última limpeza automática</span>
            <span className={`badge ${o.last_cleanup ? '' : 'badge--warn'}`}>{o.last_cleanup ? formatDateTime(String(o.last_cleanup)) : 'nunca rodou'}</span>
          </li>
        </ul>
      </section>
    </div>
  );
}

function HealthTab({ onError }: { onError: (m: string) => void }) {
  const [checks, setChecks] = useState<Record<string, boolean | null> | null>(null);
  const [loading, setLoading] = useState(false);
  const run = useCallback(async () => {
    setLoading(true);
    try {
      setChecks((await systemHealth()).checks);
    } catch (e) {
      onError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [onError]);
  useEffect(() => {
    void run();
  }, [run]);
  return (
    <section className="card">
      <div className="card__header">
        <h2>Saúde do sistema</h2>
        <button type="button" className="btn btn--sm" onClick={() => void run()} disabled={loading}>
          <Icon name="refresh" size={14} />
          Atualizar
        </button>
      </div>
      {!checks && <p className="muted">{loading ? 'Verificando…' : 'Sem dados.'}</p>}
      {checks && (
        <ul className="list">
          {Object.entries(checks).map(([key, ok]) => (
            <li key={key}>
              <span>{HEALTH_LABELS[key] ?? key}</span>
              <span className={`badge ${ok ? 'badge--ok' : 'badge--danger'}`}>{ok ? 'OK' : 'Atenção'}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="subtle">A última execução da limpeza automática aparece na Visão geral. Se "nunca rodou", confira o agendamento no Cron.</p>
    </section>
  );
}
