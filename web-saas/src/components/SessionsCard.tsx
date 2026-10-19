import { useCallback, useEffect, useState } from 'react';
import { formatDateTime, friendlyError } from '../lib/messages';
import { describeUserAgent } from '../lib/posture';
import { type SessionInfo, fetchSessions, revokeSession, signOutOtherSessions } from '../services/postureService';
import { Icon } from './ui/Icon';

export function SessionsCard({ onCount }: { onCount?: (n: number) => void }) {
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const list = await fetchSessions();
      setSessions(list);
      onCount?.(list.length);
    } catch (err) {
      setError(friendlyError(err, 'Não foi possível carregar as sessões.'));
    }
  }, [onCount]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (action: () => Promise<void>) => {
    setError('');
    setBusy(true);
    try {
      await action();
      await refresh();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const others = (sessions ?? []).filter((s) => !s.isCurrent);
  return (
    <section className="card">
      <div className="card__header">
        <div>
          <p className="eyebrow">Dispositivos</p>
          <h2>Sessões ativas</h2>
        </div>
        {others.length > 0 && (
          <button type="button" className="btn btn--danger btn--sm" disabled={busy} onClick={() => void run(signOutOtherSessions)}>
            Encerrar todas as outras
          </button>
        )}
      </div>
      {error && <div className="alert alert--error">{error}</div>}
      {!sessions && !error && <p className="muted">Carregando…</p>}
      {sessions && (
        <ul className="list">
          {sessions.map((s) => (
            <li key={s.id}>
              <span className="row">
                <Icon name="user" size={16} />
                <span>
                  <strong>{describeUserAgent(s.userAgent)}</strong>
                  {s.isCurrent && <span className="badge badge--ok"> este dispositivo</span>}
                  {s.aal === 'aal2' && <span className="badge badge--info"> com 2 etapas</span>}
                  <span className="subtle block">
                    {s.ip ? `IP ${s.ip} · ` : ''}último uso {formatDateTime(s.lastActiveAt)} · desde {formatDateTime(s.createdAt)}
                  </span>
                </span>
              </span>
              {!s.isCurrent && (
                <button type="button" className="btn btn--sm btn--danger" disabled={busy} onClick={() => void run(() => revokeSession(s.id))}>
                  Encerrar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="subtle">
        Encerrar uma sessão impede novos acessos a partir dela; um acesso já em andamento expira em até 1 hora. Se não
        reconhecer um dispositivo, troque a senha da conta.
      </p>
    </section>
  );
}
