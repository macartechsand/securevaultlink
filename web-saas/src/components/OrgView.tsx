import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { formatDateTime, friendlyError } from '../lib/messages';
import { RISK_LABEL, type RiskLevel, memberRisk, orgActions, orgSummary, riskCsv } from '../lib/orgRisk';
import { saveToDisk } from '../services/fileService';
import * as orgs from '../services/orgService';
import { StatCard } from './StatCard';

const LEVEL_BADGE: Record<RiskLevel, string> = {
  critical: 'badge--danger',
  high: 'badge--danger',
  medium: 'badge--warn',
  low: 'badge--ok',
  unknown: '',
};

type Data = NonNullable<Awaited<ReturnType<typeof orgs.fetchOrgs>>>;

/**
 * Organizations (9.7): an MSP or company groups accounts and sees a RISK PANEL built from the numeric
 * posture each member's device reports. No contents, names or URLs exist on the server to show.
 */
export function OrgView({ userId, premium }: { userId: string; premium: boolean }) {
  const [data, setData] = useState<Data | null | undefined>(undefined);
  const [selected, setSelected] = useState('');
  const [risk, setRisk] = useState<orgs.RiskRow[] | null>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      const next = await orgs.fetchOrgs();
      setData(next);
      if (next && next.orgs.length && !next.orgs.some((o) => o.id === selected)) setSelected(next.orgs[0].id);
    } catch (err) {
      setError(friendlyError(err, 'Não foi possível carregar as organizações.'));
    }
  }, [selected]);

  useEffect(() => {
    void load();
  }, [load]);

  const myRole = data?.members.find((m) => m.org_id === selected && m.user_id === userId)?.role;
  const isAdmin = myRole === 'owner' || myRole === 'admin';

  const loadRisk = useCallback(async () => {
    if (!selected || !isAdmin) return setRisk(null);
    try {
      setRisk(await orgs.fetchRisk(selected));
    } catch (err) {
      setError(friendlyError(err, 'Não foi possível carregar o painel.'));
    }
  }, [selected, isAdmin]);

  useEffect(() => {
    void loadRisk();
  }, [loadRisk]);

  const run = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setError('');
    setInfo('');
    setBusy(key);
    try {
      await fn();
      setInfo(done);
      await load();
      await loadRisk();
    } catch (err) {
      setError(friendlyError(err, 'Não foi possível concluir.'));
    } finally {
      setBusy('');
    }
  };

  const summary = useMemo(() => (risk ? orgSummary(risk) : null), [risk]);
  const actions = useMemo(() => (risk ? orgActions(risk) : []), [risk]);

  if (data === undefined) return <section className="card"><p className="muted">Carregando…</p></section>;
  if (data === null)
    return (
      <section className="card">
        <h2>Empresa</h2>
        <p className="muted">Este ambiente ainda não tem o recurso (falta aplicar a migration 20261113000000).</p>
      </section>
    );

  const org = data.orgs.find((o) => o.id === selected);
  const pendingInvites = data.invites.filter((i) => i.org_id === selected);

  return (
    <div className="grid">
      {error && <div className="alert alert--error">{error}</div>}
      {info && <div className="alert alert--ok">{info}</div>}

      {data.myInvites.length > 0 && (
        <section className="card">
          <p className="eyebrow">Convites</p>
          <h2>Organizações que convidaram você</h2>
          <div className="alert alert--info">
            Ao aceitar, os administradores da organização passam a ver os <strong>números de segurança</strong> do seu cofre: nota,
            quantas senhas fracas, reutilizadas ou vazadas, trocas vencidas, se você usa MFA e chave de recuperação. Eles{' '}
            <strong>nunca</strong> veem nomes de itens, sites, usuários ou senhas (o servidor não tem esses dados). Cada consulta ao
            painel aparece na sua Atividade. Você pode sair quando quiser.
          </div>
          <ul className="plain-list">
            {data.myInvites.map((i) => (
              <li key={i.org_id} className="row-between">
                <span>
                  <strong>{i.org_name}</strong> · {i.role === 'admin' ? 'administrador' : 'membro'}
                  {i.invited_by_email ? ` · convite de ${i.invited_by_email}` : ''}
                </span>
                <span className="row">
                  <button type="button" className="btn btn--primary btn--sm" disabled={Boolean(busy)} onClick={() => void run(i.org_id, () => orgs.accept(i.org_id), 'Você entrou na organização.')}>
                    Aceitar
                  </button>
                  <button type="button" className="btn btn--ghost btn--sm" disabled={Boolean(busy)} onClick={() => void run(i.org_id, () => orgs.decline(i.org_id), 'Convite recusado.')}>
                    Recusar
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.orgs.length > 1 && (
        <label className="field">
          Organização
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            {data.orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {org && isAdmin && risk && summary && (
        <>
          <section className="card">
            <div className="card__header">
              <div>
                <p className="eyebrow">Painel de risco</p>
                <h2>{org.name}</h2>
              </div>
              <button
                type="button"
                className="btn btn--sm"
                onClick={() =>
                  saveToDisk(new TextEncoder().encode(`﻿${riskCsv(risk)}`), `securelink-risco-${org.name.replace(/[^\w-]+/g, '_')}-${new Date().toISOString().slice(0, 10)}.csv`)
                }
              >
                Exportar CSV
              </button>
            </div>
            <div className="grid grid--stats">
              <StatCard label="Nota média" value={String(summary.averageScore ?? "—")} />
              <StatCard label="Com MFA" value={`${summary.mfaPercent}%`} />
              <StatCard label="Senhas vazadas" value={String(summary.exposed)} />
              <StatCard label="Membros em risco alto/crítico" value={String(summary.critical + summary.high)} />
            </div>
            {actions.length > 0 && (
              <>
                <h3>Prioridades</h3>
                <ol className="tight-list">
                  {actions.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ol>
              </>
            )}
            <p className="subtle">
              Só números enviados pelo aparelho de cada membro. O SecureLink não tem nomes de itens, sites ou senhas para mostrar.
            </p>
          </section>

          <section className="card">
            <h3>Membros ({risk.length})</h3>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Membro</th>
                    <th>Risco</th>
                    <th>Nota</th>
                    <th>Fracas</th>
                    <th>Reutil.</th>
                    <th>Vazadas</th>
                    <th>Trocas vencidas</th>
                    <th>MFA</th>
                    <th>Atualizado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {risk.map((r) => {
                    const { level, reasons } = memberRisk(r);
                    return (
                      <tr key={r.user_id}>
                        <td>
                          <strong>{r.email}</strong>
                          <small className="subtle block">{r.role === 'owner' ? 'dono' : r.role === 'admin' ? 'administrador' : 'membro'}</small>
                        </td>
                        <td>
                          <span className={`badge ${LEVEL_BADGE[level]}`} title={reasons.join(' · ')}>
                            {RISK_LABEL[level]}
                          </span>
                        </td>
                        <td>{r.score ?? '—'}</td>
                        <td>{r.weak ?? '—'}</td>
                        <td>{r.reused ?? '—'}</td>
                        <td>{r.exposed ?? '—'}</td>
                        <td>{r.rotation_due ?? '—'}</td>
                        <td>{r.mfa ? 'Sim' : 'Não'}</td>
                        <td>{r.reported_at ? formatDateTime(r.reported_at) : '—'}</td>
                        <td>
                          {r.user_id !== userId && r.role !== 'owner' && (myRole === 'owner' || r.role === 'member') && (
                            <button
                              type="button"
                              className="btn btn--ghost btn--sm"
                              disabled={Boolean(busy)}
                              onClick={() => {
                                if (window.confirm(`Remover ${r.email} da organização?`)) void run(r.user_id, () => orgs.removeMember(selected, r.user_id), 'Membro removido.');
                              }}
                            >
                              Remover
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <InviteCard
            ownerView={myRole === 'owner'}
            busy={busy}
            pending={pendingInvites}
            onInvite={(email, role) => run('invite', () => orgs.invite(selected, email, role), `Convite registrado para ${email}. A pessoa vê o convite em "Empresa" ao entrar com esse e-mail.`)}
            onCancel={(email) => run(email, () => orgs.cancelInvite(selected, email), 'Convite cancelado.')}
          />
        </>
      )}

      {org && !isAdmin && (
        <section className="card">
          <p className="eyebrow">Organização</p>
          <h2>{org.name}</h2>
          <p className="subtle">
            Você é membro. Os administradores veem só os números de segurança do seu cofre (nota e contagens), nunca o conteúdo.
          </p>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={Boolean(busy)}
            onClick={() => {
              if (window.confirm(`Sair de ${org.name}?`)) void run('leave', () => orgs.leave(selected), 'Você saiu da organização.');
            }}
          >
            Sair da organização
          </button>
        </section>
      )}

      <CreateOrgCard premium={premium} busy={busy === 'create'} onCreate={(name) => run('create', () => orgs.createOrg(name), 'Organização criada.')} />

      {org && myRole === 'owner' && (
        <section className="card">
          <p className="eyebrow">Zona de risco</p>
          <button
            type="button"
            className="btn btn--danger btn--sm"
            disabled={Boolean(busy)}
            onClick={() => {
              if (window.prompt(`Digite o nome da organização para excluir: ${org.name}`) === org.name) void run('delete', () => orgs.deleteOrg(selected), 'Organização excluída.');
            }}
          >
            Excluir organização
          </button>
          <p className="subtle">Exclui a organização, os convites e a lista de membros. Os cofres dos membros não são afetados.</p>
        </section>
      )}
    </div>
  );
}

function InviteCard({
  ownerView,
  busy,
  pending,
  onInvite,
  onCancel,
}: {
  ownerView: boolean;
  busy: string;
  pending: orgs.OrgInvite[];
  onInvite: (email: string, role: 'admin' | 'member') => Promise<void>;
  onCancel: (email: string) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'member'>('member');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void onInvite(email.trim(), role).then(() => setEmail(''));
  };
  return (
    <section className="card">
      <h3>Convidar</h3>
      <form className="row" onSubmit={submit}>
        <input type="email" placeholder="e-mail" value={email} onChange={(e) => setEmail(e.target.value)} required />
        {ownerView && (
          <select value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'member')}>
            <option value="member">Membro</option>
            <option value="admin">Administrador</option>
          </select>
        )}
        <button type="submit" className="btn btn--primary btn--sm" disabled={busy === 'invite' || !email}>
          Convidar
        </button>
      </form>
      {pending.length > 0 && (
        <ul className="plain-list">
          {pending.map((i) => (
            <li key={i.email} className="row-between">
              <span className="subtle">
                {i.email} · {i.role === 'admin' ? 'administrador' : 'membro'} · aguardando aceite
              </span>
              <button type="button" className="btn btn--ghost btn--sm" disabled={Boolean(busy)} onClick={() => void onCancel(i.email)}>
                Cancelar
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CreateOrgCard({ premium, busy, onCreate }: { premium: boolean; busy: boolean; onCreate: (name: string) => Promise<void> }) {
  const [name, setName] = useState('');
  return (
    <section className="card">
      <div className="card__header">
        <div>
          <p className="eyebrow">Empresa / MSP</p>
          <h2>Criar organização</h2>
        </div>
        {!premium && <span className="badge badge--info">Premium</span>}
      </div>
      <p className="subtle">
        Reúna as contas da sua equipe ou dos seus clientes e acompanhe o risco em um painel: senhas vazadas, reutilizadas, MFA,
        trocas vencidas. Cada pessoa aceita o convite e continua dona do próprio cofre.
      </p>
      {premium ? (
        <form
          className="row"
          onSubmit={(event) => {
            event.preventDefault();
            void onCreate(name.trim()).then(() => setName(''));
          }}
        >
          <input placeholder="Nome da organização" value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={80} required />
          <button type="submit" className="btn btn--primary btn--sm" disabled={busy || name.trim().length < 2}>
            Criar
          </button>
        </form>
      ) : (
        <p className="muted">Criar organizações faz parte do Premium. Aceitar convites funciona em qualquer plano.</p>
      )}
    </section>
  );
}
