import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDate, formatDateTime, friendlyError } from '../../lib/messages';
import { type AdminUser, type LicenseSummary, fetchLicenseSummary, listUsers, setPlan, setSetting } from '../../services/adminService';
import { StatCard } from '../StatCard';

type Filter = 'all' | 'premium' | 'free' | 'expiring';
const DURATIONS = [
  { value: '', label: 'Sem prazo' },
  { value: '30', label: '30 dias' },
  { value: '90', label: '90 dias' },
  { value: '180', label: '6 meses' },
  { value: '365', label: '1 ano' },
];
const WEEK = 7 * 86_400_000;

/**
 * License management: who has Premium, until when, seats in use and assignment (admin role).
 * Metadata only; never vault contents.
 */
export function LicensesTab({ canAct }: { canAct: boolean }) {
  const [summary, setSummary] = useState<LicenseSummary | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ plan: 'premium' as 'free' | 'premium', days: '', note: '' });
  const [seatsDraft, setSeatsDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const load = useCallback(async () => {
    try {
      const [s, u] = await Promise.all([fetchLicenseSummary(), listUsers('', 0, 200)]);
      setSummary(s);
      setUsers(u);
      setSeatsDraft(String(s.seats));
    } catch (e) {
      setError(friendlyError(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const notes = useMemo(() => new Map((summary?.licenses ?? []).map((l) => [l.user_id, l])), [summary]);
  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    const now = Date.now();
    return users.filter((u) => {
      if (term && !u.email.toLowerCase().includes(term)) return false;
      if (filter === 'premium') return u.plan === 'premium';
      if (filter === 'free') return u.plan !== 'premium';
      if (filter === 'expiring') return Boolean(u.plan_expires_at && Date.parse(u.plan_expires_at) - now <= WEEK);
      return true;
    });
  }, [users, filter, search]);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await fn();
      setInfo(label);
      setEditing(null);
      await load();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const openEditor = (u: AdminUser) => {
    setEditing(u.user_id);
    setDraft({ plan: u.plan === 'premium' ? 'free' : 'premium', days: '', note: notes.get(u.user_id)?.note ?? '' });
  };

  if (!summary) {
    return <section className="card">{error ? <div className="alert alert--error">{error}</div> : <p className="muted">Carregando…</p>}</section>;
  }
  const available = Math.max(summary.seats - summary.premium_in_use, 0);

  return (
    <div className="stack">
      <section className="grid grid--stats">
        <StatCard label="Licenças Premium em uso" value={`${summary.premium_in_use} de ${summary.seats}`} tone={available > 0 ? 'good' : 'bad'} note={`${available} disponível(is)`} />
        <StatCard label="Usuários" value={`${summary.users} de ${summary.max_users}`} note="limite de contas (Beta e limites)" />
        <StatCard label="Vencem em 7 dias" value={String(summary.expiring_7d.length)} tone={summary.expiring_7d.length ? 'bad' : 'good'} />
        <StatCard label="Convites Premium pendentes" value={String(summary.pending_premium_invites)} note="ocupam licença ao se cadastrar" />
      </section>

      {summary.expiring_7d.length > 0 && (
        <div className="alert alert--warn">
          Vencendo em breve:{' '}
          {summary.expiring_7d.map((e) => `${e.email} (${formatDate(e.expires_at)})`).join(', ')}. Ao vencer, a conta volta ao Gratuito
          automaticamente: os dados continuam, mas novos envios seguem a cota menor.
        </div>
      )}

      <section className="card">
        <div className="row-between">
          <div>
            <p className="eyebrow">Licenças</p>
            <h2>Usuários e tipo de licença</h2>
            <p className="subtle">
              Atribua Premium com ou sem prazo. Uma licença vencida libera a vaga sozinha. Renovar ou mudar o prazo de quem já é
              Premium não ocupa outra vaga.
            </p>
          </div>
          {canAct && (
            <form
              className="field__inline"
              onSubmit={(e) => {
                e.preventDefault();
                void run(`Total de licenças Premium: ${seatsDraft}.`, () => setSetting('premium_seats', seatsDraft.trim()));
              }}
            >
              <label className="subtle" htmlFor="seats">
                Licenças Premium
              </label>
              <input id="seats" type="number" min={0} max={100000} value={seatsDraft} onChange={(e) => setSeatsDraft(e.target.value)} />
              <button type="submit" className="btn btn--sm" disabled={busy || seatsDraft === String(summary.seats)}>
                Salvar
              </button>
            </form>
          )}
        </div>

        <div className="row">
          <input type="search" placeholder="Buscar por e-mail" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar por e-mail" />
          <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} aria-label="Filtrar licenças">
            <option value="all">Todos</option>
            <option value="premium">Premium</option>
            <option value="free">Gratuito</option>
            <option value="expiring">Premium vencendo (7 dias)</option>
          </select>
        </div>
        {info && <div className="alert alert--ok">{info}</div>}
        {error && <div className="alert alert--error">{error}</div>}

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Licença</th>
                <th>Uso</th>
                <th>
                  <span className="sr-only">Ação</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((u) => {
                const lic = notes.get(u.user_id);
                return (
                  <tr key={u.user_id}>
                    <td>
                      <strong>{u.email}</strong>
                      <small className="subtle block">
                        último acesso {u.last_sign_in_at ? formatDateTime(u.last_sign_in_at) : 'nunca'}
                        {u.mfa_factors > 0 ? ' · MFA ativo' : ' · sem MFA'}
                      </small>
                    </td>
                    <td>
                      <span className={`badge ${u.plan === 'premium' ? 'badge--info' : ''}`}>{u.plan === 'premium' ? 'Premium' : 'Gratuito'}</span>
                      <small className="subtle block">
                        {u.plan === 'premium' ? (u.plan_expires_at ? `até ${formatDate(u.plan_expires_at)}` : 'sem prazo') : ''}
                        {lic?.note ? ` · ${lic.note}` : ''}
                        {lic?.granted_by ? ` · por ${lic.granted_by}` : ''}
                      </small>
                    </td>
                    <td>
                      <small className="subtle">
                        {u.has_vault ? `${u.items} itens · ${u.files} arquivos` : 'cofre não criado'}
                      </small>
                    </td>
                    <td>
                      {canAct && editing !== u.user_id && (
                        <button type="button" className="btn btn--sm" onClick={() => openEditor(u)} disabled={busy}>
                          Alterar licença
                        </button>
                      )}
                      {canAct && editing === u.user_id && (
                        <form
                          className="stack-sm"
                          onSubmit={(e) => {
                            e.preventDefault();
                            const days = draft.plan === 'premium' && draft.days ? Number(draft.days) : null;
                            if (days !== null && (!Number.isInteger(days) || days < 1 || days > 3650)) {
                              setError('Prazo: de 1 a 3650 dias.');
                              return;
                            }
                            const label = draft.plan === 'premium' ? `Premium${days ? ` por ${days} dias` : ' sem prazo'}` : 'Gratuito';
                            void run(`${u.email}: ${label}.`, () => setPlan(u.user_id, draft.plan, days, draft.note));
                          }}
                        >
                          <select value={draft.plan} onChange={(e) => setDraft({ ...draft, plan: e.target.value as 'free' | 'premium' })} aria-label="Tipo de licença">
                            <option value="premium">Premium</option>
                            <option value="free">Gratuito</option>
                          </select>
                          {draft.plan === 'premium' && (
                            <select value={DURATIONS.some((d) => d.value === draft.days) ? draft.days : 'custom'} onChange={(e) => setDraft({ ...draft, days: e.target.value === 'custom' ? '30' : e.target.value })} aria-label="Prazo">
                              {DURATIONS.map((d) => (
                                <option key={d.value} value={d.value}>
                                  {d.label}
                                </option>
                              ))}
                              <option value="custom">Outro (dias)</option>
                            </select>
                          )}
                          {draft.plan === 'premium' && !DURATIONS.some((d) => d.value === draft.days) && (
                            <input type="number" min={1} max={3650} value={draft.days} onChange={(e) => setDraft({ ...draft, days: e.target.value })} aria-label="Dias" />
                          )}
                          <input placeholder="Observação (só admins)" maxLength={200} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
                          <span className="row">
                            <button type="submit" className="btn btn--sm btn--primary" disabled={busy}>
                              Aplicar
                            </button>
                            <button type="button" className="btn btn--sm btn--ghost" onClick={() => setEditing(null)} disabled={busy}>
                              Cancelar
                            </button>
                          </span>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {shown.length === 0 && <p className="empty">Nenhum usuário com esse filtro.</p>}
      </section>
    </div>
  );
}
