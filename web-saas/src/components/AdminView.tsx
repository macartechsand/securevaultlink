import { useCallback, useEffect, useState } from 'react';
import { formatBytes, formatDateTime, friendlyError } from '../lib/messages';
import {
  type AdminEvent,
  type AdminOverview,
  type AdminStatus,
  type AdminUser,
  fetchOverview,
  listUsers,
  resetUserMfa,
  revokeUserSessions,
  setPlan,
  suspendUser,
  systemHealth,
  unsuspendUser,
  userEvents,
} from '../services/adminService';
import { BetaAdminTab } from './BetaAdminTab';
import { StatCard } from './StatCard';
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
  const [tab, setTab] = useState<'overview' | 'users' | 'beta' | 'health'>('overview');
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
        Você está no modo administrador ({status.role === 'admin' ? 'administrador' : 'suporte'}). O painel mostra apenas
        metadados: ninguém, nem administradores, consegue ver o conteúdo dos cofres. Toda ação aqui fica no log de
        auditoria do usuário afetado.
      </div>
      <div className="tabs" role="tablist">
        {(
          [
            ['overview', 'Visão geral'],
            ['users', 'Usuários'],
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
      {tab === 'users' && <UsersTab canAct={status.role === 'admin'} onError={setError} />}
      {tab === 'beta' && <BetaAdminTab canAct={status.role === 'admin'} />}
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

function UsersTab({ canAct, onError }: { canAct: boolean; onError: (m: string) => void }) {
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [selected, setSelected] = useState<AdminUser | null>(null);

  const load = useCallback(
    async (term: string) => {
      try {
        setUsers(await listUsers(term));
      } catch (e) {
        onError(friendlyError(e));
      }
    },
    [onError],
  );

  useEffect(() => {
    void load('');
  }, [load]);

  return (
    <section className="card">
      <form
        className="field__inline"
        onSubmit={(e) => {
          e.preventDefault();
          void load(search);
        }}
      >
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por e-mail" />
        <button type="submit" className="btn">
          <Icon name="search" />
          Buscar
        </button>
      </form>
      {!users && <p className="muted">Carregando…</p>}
      {users && users.length === 0 && <p className="empty">Nenhum usuário encontrado.</p>}
      {users && users.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Plano</th>
                <th>Segurança</th>
                <th>Uso</th>
                <th>Sinais (7 dias)</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.user_id}>
                  <td>
                    <button type="button" className="cell-button" onClick={() => setSelected(u)}>
                      <strong>{u.email}</strong>
                      <small className="subtle block">
                        desde {formatDateTime(u.created_at)} · último acesso {u.last_sign_in_at ? formatDateTime(u.last_sign_in_at) : 'nunca'}
                      </small>
                    </button>
                  </td>
                  <td>
                    <span className={`badge ${u.plan === 'premium' ? 'badge--info' : ''}`}>{u.plan === 'premium' ? 'Premium' : 'Gratuito'}</span>
                  </td>
                  <td>
                    <div className="badges">
                      {u.banned_until && new Date(u.banned_until) > new Date() && <span className="badge badge--danger">Suspenso</span>}
                      {!u.confirmed && <span className="badge badge--warn">E-mail não confirmado</span>}
                      <span className={`badge ${u.mfa_factors ? 'badge--ok' : 'badge--warn'}`}>{u.mfa_factors ? 'MFA' : 'Sem MFA'}</span>
                      {u.has_vault && <span className={`badge ${u.recovery ? 'badge--ok' : ''}`}>{u.recovery ? 'Recuperação' : 'Sem recuperação'}</span>}
                    </div>
                  </td>
                  <td className="nowrap">
                    {u.items} itens · {u.files} arquivos
                    <small className="subtle block">{formatBytes(Number(u.storage_bytes))}</small>
                  </td>
                  <td>
                    <div className="badges">
                      {u.failed_unlocks_7d > 0 && <span className="badge badge--warn">{u.failed_unlocks_7d} desbloqueios falhos</span>}
                      {u.client_errors_7d > 0 && <span className="badge badge--warn">{u.client_errors_7d} erros do app</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected && (
        <UserDetail
          user={selected}
          canAct={canAct}
          onClose={() => setSelected(null)}
          onChanged={() => void load(search)}
        />
      )}
    </section>
  );
}

function UserDetail({ user, canAct, onClose, onChanged }: { user: AdminUser; canAct: boolean; onClose: () => void; onChanged: () => void }) {
  const [events, setEvents] = useState<AdminEvent[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const suspended = Boolean(user.banned_until && new Date(user.banned_until) > new Date());

  useEffect(() => {
    userEvents(user.user_id)
      .then(setEvents)
      .catch((e) => setError(friendlyError(e)));
  }, [user.user_id]);

  const act = async (label: string, confirmText: string, fn: () => Promise<unknown>) => {
    if (!window.confirm(confirmText)) return;
    setError('');
    setInfo('');
    setBusy(true);
    try {
      await fn();
      setInfo(label);
      onChanged();
      setEvents(await userEvents(user.user_id));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="admin-user-title">
      <div className="modal modal--wide">
        <div className="card__header">
          <div>
            <p className="eyebrow">Usuário</p>
            <h2 id="admin-user-title">{user.email}</h2>
            <p className="subtle mono">{user.user_id}</p>
          </div>
          <button type="button" className="btn btn--ghost icon-btn" onClick={onClose} aria-label="Fechar">
            <Icon name="close" />
          </button>
        </div>

        {canAct ? (
          <div className="row">
            <select
              className="filter-select"
              value={user.plan}
              disabled={busy}
              aria-label="Plano"
              onChange={(e) => {
                const plan = e.target.value as 'free' | 'premium';
                void act(`Plano alterado para ${plan}.`, `Alterar o plano de ${user.email} para ${plan}?`, () => setPlan(user.user_id, plan));
              }}
            >
              <option value="free">Plano gratuito</option>
              <option value="premium">Plano Premium</option>
            </select>
            <button
              type="button"
              className="btn btn--sm"
              disabled={busy || user.mfa_factors === 0}
              onClick={() =>
                void act(
                  'Verificação em duas etapas removida. O usuário deve configurá-la de novo.',
                  `Remover a verificação em duas etapas de ${user.email}? Faça isso só depois de confirmar a identidade da pessoa por outro canal.`,
                  () => resetUserMfa(user.user_id),
                )
              }
            >
              Resetar MFA
            </button>
            <button
              type="button"
              className="btn btn--sm"
              disabled={busy}
              onClick={() => void act('Sessões encerradas.', `Encerrar todas as sessões de ${user.email}?`, () => revokeUserSessions(user.user_id))}
            >
              Encerrar sessões
            </button>
            <button
              type="button"
              className={`btn btn--sm ${suspended ? '' : 'btn--danger'}`}
              disabled={busy}
              onClick={() =>
                void act(
                  suspended ? 'Conta reativada.' : 'Conta suspensa e sessões encerradas.',
                  suspended ? `Reativar ${user.email}?` : `Suspender ${user.email}? A pessoa não conseguirá entrar até ser reativada.`,
                  () => (suspended ? unsuspendUser(user.user_id) : suspendUser(user.user_id)),
                )
              }
            >
              {suspended ? 'Reativar conta' : 'Suspender conta'}
            </button>
          </div>
        ) : (
          <p className="subtle">Perfil de suporte: somente leitura.</p>
        )}
        <div className="alert">
          Não existe ação de administrador para abrir ou recuperar o cofre: o conteúdo é cifrado com a senha mestra do
          usuário. Sem a senha mestra ou a chave de recuperação dele, os dados não podem ser lidos.
        </div>
        {info && <div className="alert alert--ok">{info}</div>}
        {error && <div className="alert alert--error">{error}</div>}

        <h3>Eventos recentes</h3>
        {!events && <p className="muted">Carregando…</p>}
        {events && events.length === 0 && <p className="empty">Sem eventos.</p>}
        {events && events.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Evento</th>
                  <th>Origem</th>
                  <th>Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td className="nowrap">{formatDateTime(e.created_at)}</td>
                    <td>
                      <code>{e.event}</code>
                    </td>
                    <td>{e.actor_id && e.actor_id !== user.user_id ? 'admin/outro' : e.source === 'server' ? 'servidor' : 'app'}</td>
                    <td className="subtle mono">{Object.keys(e.details ?? {}).length ? JSON.stringify(e.details).slice(0, 140) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
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
