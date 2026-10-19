import { useCallback, useEffect, useState } from 'react';
import { formatDateTime, friendlyError } from '../../lib/messages';
import { type GlobalEvent, globalEvents } from '../../services/adminService';
import { Icon } from '../ui/Icon';

const FILTERS = [
  ['', 'Todos'],
  ['admin.', 'Ações administrativas'],
  ['vault.', 'Cofre'],
  ['item.', 'Compartilhamento de itens'],
  ['file.', 'Arquivos'],
  ['transfer.', 'Transferências'],
  ['session.', 'Sessões'],
  ['mfa.', 'Duas etapas'],
  ['client.error', 'Erros do app'],
  ['support.', 'Suporte'],
  ['system.', 'Sistema'],
] as const;

/** Read-only, platform-wide audit feed (metadata only). */
export function EventsTab() {
  const [prefix, setPrefix] = useState('');
  const [events, setEvents] = useState<GlobalEvent[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async (p: string) => {
    setEvents(null);
    try {
      setEvents(await globalEvents(p));
    } catch (e) {
      setError(friendlyError(e));
    }
  }, []);

  useEffect(() => {
    void load(prefix);
  }, [load, prefix]);

  return (
    <section className="card">
      <div className="card__header">
        <div>
          <p className="eyebrow">Auditoria</p>
          <h2>Eventos da plataforma</h2>
        </div>
        <div className="row">
          <select className="filter-select" value={prefix} onChange={(e) => setPrefix(e.target.value)} aria-label="Filtrar eventos">
            {FILTERS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn--sm" onClick={() => void load(prefix)}>
            <Icon name="refresh" size={14} />
            Atualizar
          </button>
        </div>
      </div>
      {error && <div className="alert alert--error">{error}</div>}
      {!events && !error && <p className="muted">Carregando…</p>}
      {events && events.length === 0 && <p className="empty">Nenhum evento.</p>}
      {events && events.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Conta</th>
                <th>Evento</th>
                <th>Origem</th>
                <th>Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="nowrap">{formatDateTime(e.created_at)}</td>
                  <td>{e.user_email ?? (e.user_id ? e.user_id.slice(0, 8) : 'sistema')}</td>
                  <td>
                    <code>{e.event}</code>
                  </td>
                  <td>{e.actor_id && e.actor_id !== e.user_id ? 'admin/outro' : e.source === 'server' ? 'servidor' : 'app'}</td>
                  <td className="subtle mono">{Object.keys(e.details ?? {}).length ? JSON.stringify(e.details).slice(0, 140) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
