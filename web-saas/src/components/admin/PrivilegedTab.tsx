import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { formatDateTime, friendlyError } from '../../lib/messages';
import { ROLE_LABELS, type RoleGrant, grantRole, listRoles, listUsers, revokeRole } from '../../services/adminService';

const DURATIONS = [
  { hours: 1, label: '1 hora (just-in-time)' },
  { hours: 8, label: '8 horas' },
  { hours: 24, label: '24 horas' },
  { hours: 24 * 7, label: '7 dias' },
  { hours: 24 * 30, label: '30 dias' },
  { hours: 0, label: 'Permanente' },
];

/** Privileged Access Management: who holds which role, until when, why, and with MFA or not. */
export function PrivilegedTab({ isOwner }: { isOwner: boolean }) {
  const [roles, setRoles] = useState<RoleGrant[] | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'support' | 'auditor'>('support');
  const [hours, setHours] = useState(8);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const load = useCallback(async () => {
    try {
      setRoles(await listRoles());
    } catch (e) {
      setError(friendlyError(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setError('');
    setInfo('');
    setBusy(true);
    try {
      await fn();
      setInfo(label);
      await load();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const grant = (event: FormEvent) => {
    event.preventDefault();
    void run(`${ROLE_LABELS[role]} concedido a ${email}.`, async () => {
      const match = (await listUsers(email)).find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
      if (!match) throw new Error('Usuário não encontrado. A pessoa precisa ter conta.');
      await grantRole(match.user_id, role, hours === 0 ? null : hours, reason);
      setEmail('');
      setReason('');
    });
  };

  return (
    <div className="stack">
      <section className="card">
        <div>
          <p className="eyebrow">Revisão de acessos privilegiados</p>
          <h2>Contas com privilégios ({roles?.filter((r) => r.active).length ?? 0})</h2>
          <p className="subtle">
            Toda conta privilegiada precisa de MFA: sem ela, o painel e as funções administrativas recusam o acesso. Acessos
            temporários expiram sozinhos.
          </p>
        </div>
        {error && <div className="alert alert--error">{error}</div>}
        {info && <div className="alert alert--ok">{info}</div>}
        {roles && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Conta</th>
                  <th>Papel</th>
                  <th>Validade</th>
                  <th>Justificativa</th>
                  <th>Controles</th>
                  <th>
                    <span className="sr-only">Ação</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {roles.map((r) => (
                  <tr key={r.user_id}>
                    <td>
                      <strong>{r.email}</strong>
                      <small className="subtle block">último acesso {r.last_sign_in_at ? formatDateTime(r.last_sign_in_at) : 'nunca'}</small>
                    </td>
                    <td>
                      <span className="badge badge--info">{ROLE_LABELS[r.role]}</span>
                    </td>
                    <td className="nowrap">
                      {!r.active ? <span className="badge">expirado</span> : r.expires_at ? `até ${formatDateTime(r.expires_at)}` : 'permanente'}
                    </td>
                    <td className="subtle">
                      {r.reason ?? '—'}
                      {r.granted_by_email && <span className="block">por {r.granted_by_email}</span>}
                    </td>
                    <td>
                      <span className={`badge ${r.mfa ? 'badge--ok' : 'badge--danger'}`}>{r.mfa ? 'MFA ativo' : 'SEM MFA'}</span>
                    </td>
                    <td>
                      {isOwner && r.role !== 'owner' && (
                        <button type="button" className="btn btn--sm btn--danger" disabled={busy} onClick={() => void run('Acesso revogado.', () => revokeRole(r.user_id))}>
                          Revogar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <div>
          <p className="eyebrow">Conceder acesso</p>
          <h2>Elevação de privilégio</h2>
          <p className="subtle">
            Prefira acessos temporários (just-in-time) e o menor papel necessário: <strong>Suporte</strong> e{' '}
            <strong>Auditor</strong> são somente leitura; <strong>Administrador</strong> pode alterar usuários e configurações.
            Só o administrador master concede ou revoga papéis.
          </p>
        </div>
        {isOwner ? (
          <form className="form" onSubmit={grant}>
            <div className="grid grid--2">
              <label className="field">
                E-mail da conta
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </label>
              <label className="field">
                Papel
                <select value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
                  <option value="support">{ROLE_LABELS.support}</option>
                  <option value="auditor">{ROLE_LABELS.auditor}</option>
                  <option value="admin">{ROLE_LABELS.admin}</option>
                </select>
              </label>
              <label className="field">
                Duração
                <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
                  {DURATIONS.map((d) => (
                    <option key={d.hours} value={d.hours}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Justificativa (obrigatória, fica na auditoria)
                <input value={reason} onChange={(e) => setReason(e.target.value)} minLength={5} maxLength={300} required placeholder="ex.: atender chamado #123" />
              </label>
            </div>
            <div className="form__actions">
              <button type="submit" className="btn btn--primary" disabled={busy}>
                Conceder acesso
              </button>
            </div>
          </form>
        ) : (
          <p className="subtle">Somente o administrador master pode conceder papéis.</p>
        )}
      </section>
    </div>
  );
}
