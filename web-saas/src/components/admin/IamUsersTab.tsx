import { useCallback, useEffect, useState } from 'react';
import { formatBytes, formatDateTime, friendlyError } from '../../lib/messages';
import {
  type AdminEvent,
  type AdminUser,
  ROLE_LABELS,
  type UserInsights,
  createRecoveryLink,
  listUsers,
  resetUserMfa,
  revokeUserSessions,
  setPlan,
  setUserMfaPolicy,
  suspendUser,
  unsuspendUser,
  userEvents,
  userInsights,
} from '../../services/adminService';
import { SNAPSHOT_FIELD_LABELS } from '../../services/supportService';
import { OneTimeLink } from '../OneTimeLink';
import { Icon } from '../ui/Icon';

const PROVIDER_LABELS: Record<string, string> = { email: 'E-mail e senha', google: 'Google', github: 'GitHub' };

export function IamUsersTab({ canAct }: { canAct: boolean }) {
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async (term: string) => {
    try {
      setUsers(await listUsers(term));
    } catch (e) {
      setError(friendlyError(e));
    }
  }, []);

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
      {error && <div className="alert alert--error">{error}</div>}
      {!users && !error && <p className="muted">Carregando…</p>}
      {users && users.length === 0 && <p className="empty">Nenhum usuário encontrado.</p>}
      {users && users.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Identidade</th>
                <th>Segurança</th>
                <th>Postura</th>
                <th>Uso</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const suspended = Boolean(u.banned_until && new Date(u.banned_until) > new Date());
                return (
                  <tr key={u.user_id}>
                    <td>
                      <button type="button" className="cell-button" onClick={() => setSelected(u)}>
                        <strong>{u.email}</strong>
                        <small className="subtle block">
                          último acesso {u.last_sign_in_at ? formatDateTime(u.last_sign_in_at) : 'nunca'}
                        </small>
                      </button>
                    </td>
                    <td>
                      <div className="badges">
                        {u.role && <span className="badge badge--info">{ROLE_LABELS[u.role]}</span>}
                        <span className={`badge ${u.plan === 'premium' ? 'badge--info' : ''}`}>
                          {u.plan === 'premium' ? (u.plan_expires_at ? `Premium até ${formatDateTime(u.plan_expires_at)}` : 'Premium') : 'Gratuito'}
                        </span>
                        {u.providers.map((p) => (
                          <span key={p} className="badge">
                            {PROVIDER_LABELS[p] ?? p}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <div className="badges">
                        {suspended && <span className="badge badge--danger">Suspenso</span>}
                        {!u.confirmed && <span className="badge badge--warn">E-mail não confirmado</span>}
                        <span className={`badge ${u.mfa_factors ? 'badge--ok' : u.mfa_required ? 'badge--danger' : 'badge--warn'}`}>
                          {u.mfa_factors ? 'MFA' : u.mfa_required ? 'MFA exigido, pendente' : 'Sem MFA'}
                        </span>
                        {u.has_vault && <span className={`badge ${u.recovery ? 'badge--ok' : ''}`}>{u.recovery ? 'Recuperação' : 'Sem recuperação'}</span>}
                        {u.failed_unlocks_7d > 0 && <span className="badge badge--warn">{u.failed_unlocks_7d} desbloqueios falhos</span>}
                        {u.client_errors_7d > 0 && <span className="badge badge--warn">{u.client_errors_7d} erros do app</span>}
                      </div>
                    </td>
                    <td>
                      {u.posture_score === null ? (
                        <span className="subtle">sem dados</span>
                      ) : (
                        <span className={`badge ${u.posture_score >= 70 ? 'badge--ok' : u.posture_score >= 50 ? 'badge--warn' : 'badge--danger'}`}>{u.posture_score}/100</span>
                      )}
                    </td>
                    <td className="nowrap">
                      {u.items} itens · {u.files} arquivos
                      <small className="subtle block">{formatBytes(Number(u.storage_bytes))}</small>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {selected && <UserDetail user={selected} canAct={canAct} onClose={() => setSelected(null)} onChanged={() => void load(search)} />}
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: string | number; tone?: 'ok' | 'warn' | 'danger' }) {
  return (
    <li>
      <span>{label}</span>
      <span className={`badge ${tone ? `badge--${tone}` : ''}`}>{value}</span>
    </li>
  );
}

function UserDetail({ user, canAct, onClose, onChanged }: { user: AdminUser; canAct: boolean; onClose: () => void; onChanged: () => void }) {
  const [tab, setTab] = useState<'insights' | 'iam' | 'events' | 'support'>('insights');
  const [insights, setInsights] = useState<UserInsights | null>(null);
  const [events, setEvents] = useState<AdminEvent[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [oneTime, setOneTime] = useState<{ email: string; link: string } | null>(null);
  const suspended = Boolean(user.banned_until && new Date(user.banned_until) > new Date());

  const refresh = useCallback(async () => {
    try {
      const [i, e] = await Promise.all([userInsights(user.user_id), userEvents(user.user_id)]);
      setInsights(i);
      setEvents(e);
    } catch (err) {
      setError(friendlyError(err));
    }
  }, [user.user_id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const act = async (label: string, confirmText: string, fn: () => Promise<unknown>) => {
    if (!window.confirm(confirmText)) return;
    setError('');
    setInfo('');
    setBusy(true);
    try {
      await fn();
      setInfo(label);
      onChanged();
      await refresh();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const posture = insights?.posture?.data;
  const vault = insights?.vault as { kdf_iterations?: number; recovery?: boolean; created_at?: string } | null | undefined;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="iam-user-title">
      <div className="modal modal--wide">
        <div className="card__header">
          <div>
            <p className="eyebrow">Usuário{user.role ? ` · ${ROLE_LABELS[user.role]}` : ''}</p>
            <h2 id="iam-user-title">{user.email}</h2>
            <p className="subtle mono">{user.user_id}</p>
          </div>
          <button type="button" className="btn btn--ghost icon-btn" onClick={onClose} aria-label="Fechar">
            <Icon name="close" />
          </button>
        </div>

        <div className="tabs" role="tablist">
          {(
            [
              ['insights', 'Insights de segurança'],
              ['iam', 'Identidade e acesso'],
              ['events', 'Eventos'],
              ['support', `Suporte (${insights?.reports.length ?? 0})`],
            ] as const
          ).map(([key, label]) => (
            <button key={key} type="button" role="tab" className={`tab ${tab === key ? 'is-active' : ''}`} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </div>
        {info && <div className="alert alert--ok">{info}</div>}
        {oneTime && <OneTimeLink email={oneTime.email} link={oneTime.link} kind="recovery" onClose={() => setOneTime(null)} />}
        {error && <div className="alert alert--error">{error}</div>}
        {!insights && !error && <p className="muted">Carregando…</p>}

        {insights && tab === 'insights' && (
          <div className="grid grid--2">
            <div className="stack-sm">
              <h3>Postura (informada pelo app do usuário)</h3>
              {!insights.metrics_sharing && <div className="alert">O usuário desligou o compartilhamento de métricas.</div>}
              {posture ? (
                <>
                  <p className="subtle">Atualizado em {formatDateTime(insights.posture!.reported_at)}</p>
                  <ul className="list">
                    {(Object.keys(SNAPSHOT_FIELD_LABELS) as (keyof typeof SNAPSHOT_FIELD_LABELS)[])
                      .filter((k) => k in posture)
                      .map((k) => {
                        const v = posture[k];
                        const bad = ['weak', 'reused', 'exposed', 'unsafe_sites', 'rotation_due', 'undecryptable'].includes(k) && Number(v) > 0;
                        const missing = (k === 'mfa' || k === 'recovery') && v === false;
                        return (
                          <Metric
                            key={k}
                            label={SNAPSHOT_FIELD_LABELS[k]}
                            value={typeof v === 'boolean' ? (v ? 'sim' : 'não') : v}
                            tone={k === 'exposed' && bad ? 'danger' : bad || missing ? 'warn' : undefined}
                          />
                        );
                      })}
                  </ul>
                </>
              ) : (
                <p className="empty">Sem métricas ainda (o usuário não abriu o cofre desde a ativação).</p>
              )}
            </div>
            <div className="stack-sm">
              <h3>Metadados do servidor</h3>
              <ul className="list">
                <Metric label="Provedores de login" value={insights.providers.map((p) => PROVIDER_LABELS[p] ?? p).join(', ') || '—'} />
                <Metric label="Fatores MFA verificados" value={Number(insights.mfa_factors)} tone={Number(insights.mfa_factors) ? 'ok' : 'warn'} />
                <Metric label="MFA exigido por política" value={insights.mfa_required ? 'sim' : 'não'} />
                <Metric label="Sessões ativas" value={Number(insights.sessions)} />
                <Metric label="Última atividade de sessão" value={insights.last_session_activity ? formatDateTime(String(insights.last_session_activity)) : '—'} />
                <Metric label="Cofre criado" value={vault?.created_at ? formatDateTime(vault.created_at) : 'não'} />
                <Metric label="Iterações do KDF" value={vault?.kdf_iterations ?? '—'} tone={vault?.kdf_iterations && vault.kdf_iterations < 600000 ? 'danger' : undefined} />
                <Metric label="Chave de recuperação" value={vault?.recovery ? 'ativa' : 'inativa'} tone={vault && !vault.recovery ? 'warn' : undefined} />
                <Metric label="Itens no formato antigo (v1)" value={Number(insights.entries_v1)} tone={Number(insights.entries_v1) ? 'warn' : undefined} />
                <Metric label="Itens no formato atual (v2)" value={Number(insights.entries_v2)} />
                <Metric label="Chaves de compartilhamento" value={insights.sharing_keys ? 'criadas' : 'não criadas'} />
                <Metric label="Arquivos / espaço" value={`${insights.files} · ${formatBytes(Number(insights.storage_bytes))}`} />
                <Metric label="Compartilhamentos de itens (saída / entrada)" value={`${insights.item_shares_out} / ${insights.item_shares_in}`} />
                <Metric label="Compartilhamentos de arquivos / transferências ativas" value={`${insights.file_shares_out} / ${insights.active_transfers}`} />
              </ul>
            </div>
          </div>
        )}

        {insights && tab === 'iam' && (
          <div className="stack">
            {!canAct && <p className="subtle">Perfil somente leitura.</p>}
            <div className="grid grid--2">
              <label className="field">
                Plano
                <select
                  value={user.plan}
                  disabled={!canAct || busy}
                  onChange={(e) => {
                    const plan = e.target.value as 'free' | 'premium';
                    void act(`Plano alterado para ${plan}.`, `Alterar o plano de ${user.email} para ${plan}?`, () => setPlan(user.user_id, plan));
                  }}
                >
                  <option value="free">Gratuito</option>
                  <option value="premium">Premium</option>
                </select>
              </label>
              <label className="field">
                Verificação em duas etapas
                <select
                  value={insights.mfa_required ? 'required' : 'optional'}
                  disabled={!canAct || busy || Boolean(user.role)}
                  onChange={(e) => {
                    const required = e.target.value === 'required';
                    void act(
                      required ? 'MFA agora é obrigatório para este usuário.' : 'MFA voltou a ser opcional.',
                      required
                        ? `Exigir MFA de ${user.email}? Sem um segundo fator, a pessoa não acessa o cofre até ativar.`
                        : `Tornar o MFA opcional para ${user.email}?`,
                      () => setUserMfaPolicy(user.user_id, required),
                    );
                  }}
                >
                  <option value="optional">Opcional</option>
                  <option value="required">Obrigatório</option>
                </select>
                {user.role && <span className="field__hint">Contas privilegiadas sempre exigem MFA.</span>}
              </label>
            </div>
            {canAct && (
              <div className="row">
                <button
                  type="button"
                  className="btn btn--sm"
                  disabled={busy}
                  onClick={() =>
                    void act(
                      'Link gerado. Envie à pessoa por um canal seguro.',
                      `Gerar um link de redefinição da senha de ACESSO de ${user.email}? Confirme a identidade por outro canal antes.`,
                      async () => setOneTime(await createRecoveryLink(user.user_id)),
                    )
                  }
                >
                  Gerar link de redefinição
                </button>
                <button
                  type="button"
                  className="btn btn--sm"
                  disabled={busy || user.mfa_factors === 0}
                  onClick={() =>
                    void act(
                      'Verificação em duas etapas removida.',
                      `Remover a verificação em duas etapas de ${user.email}? Faça isso só depois de confirmar a identidade da pessoa.`,
                      () => resetUserMfa(user.user_id),
                    )
                  }
                >
                  Resetar MFA
                </button>
                <button type="button" className="btn btn--sm" disabled={busy} onClick={() => void act('Sessões encerradas.', `Encerrar todas as sessões de ${user.email}?`, () => revokeUserSessions(user.user_id))}>
                  Encerrar sessões
                </button>
                <button
                  type="button"
                  className={`btn btn--sm ${suspended ? '' : 'btn--danger'}`}
                  disabled={busy || user.role === 'owner'}
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
            )}
            <div className="alert">
              Não existe ação para abrir ou recuperar o cofre: o conteúdo é cifrado com a senha mestra do usuário. Papéis
              privilegiados são gerenciados na aba "Acesso privilegiado (PAM)".
            </div>
          </div>
        )}

        {tab === 'events' && events && (
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

        {insights && tab === 'support' && (
          <div className="stack-sm">
            <p className="subtle">Relatórios de diagnóstico enviados pelo usuário (sem senhas, e-mail ou dados do cofre).</p>
            {insights.reports.length === 0 ? (
              <p className="empty">Nenhum relatório enviado.</p>
            ) : (
              insights.reports.map((r) => (
                <div key={r.id} className="stack-sm">
                  <span className="subtle">{formatDateTime(r.created_at)}</span>
                  <textarea readOnly rows={8} value={r.report} className="mono" />
                </div>
              ))
            )}
            <h3>Eventos dos últimos 30 dias</h3>
            <div className="badges">
              {Object.entries(insights.events_30d).map(([event, n]) => (
                <span key={event} className="badge">
                  {event}: {n}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
