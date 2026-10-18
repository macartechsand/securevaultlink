import { useMemo } from 'react';
import { CATEGORY_LABELS, CONNECTORS, type ConnectorCategory, EXECUTOR_LABELS, type Executor } from '../lib/connectors';
import { type ItemHealth, RISK_LABELS, type RiskFlag } from '../lib/itemHealth';
import { rotationDueInDays, typeLabel } from '../lib/items';
import type { VaultItem } from '../state/itemOps';
import { Icon } from './ui/Icon';

const PRIORITY: RiskFlag[] = ['exposed', 'unsafe', 'weak', 'reused', 'due', 'stale'];
const RISK_BADGE: Record<RiskFlag, string> = {
  exposed: 'badge--danger',
  unsafe: 'badge--danger',
  weak: 'badge--danger',
  reused: 'badge--warn',
  due: 'badge--warn',
  stale: 'badge--warn',
};
const EXECUTOR_BADGE: Record<Executor, string> = { assisted: 'badge--ok', cloud: 'badge--info', agent: '' };

type RotationViewProps = {
  items: VaultItem[];
  health: ItemHealth;
  onRotate: (item: VaultItem) => void;
  onOpen: (item: VaultItem) => void;
};

export function RotationView({ items, health, onRotate, onOpen }: RotationViewProps) {
  const queue = useMemo(
    () =>
      items
        .filter((i) => i.access !== 'view')
        .map((i) => ({ item: i, risks: (health.risksById.get(i.id) ?? []).filter((r) => r !== 'unsafe' || i.data.type === 'login') }))
        .filter((x) => x.risks.length > 0)
        .sort((a, b) => Math.min(...a.risks.map((r) => PRIORITY.indexOf(r))) - Math.min(...b.risks.map((r) => PRIORITY.indexOf(r)))),
    [items, health],
  );

  const scheduled = useMemo(
    () =>
      items
        .map((i) => ({ item: i, due: rotationDueInDays(i.data, i.createdAt) }))
        .filter((x): x is { item: VaultItem; due: number } => x.due !== null)
        .sort((a, b) => a.due - b.due),
    [items],
  );

  const byCategory = useMemo(() => {
    const map = new Map<ConnectorCategory, typeof CONNECTORS>();
    for (const c of CONNECTORS) map.set(c.category, [...(map.get(c.category) ?? []), c]);
    return [...map.entries()];
  }, []);

  return (
    <div className="stack">
      <section className="card">
        <div>
          <p className="eyebrow">Fila de correção</p>
          <h2>
            O que trocar primeiro <span className="muted">({queue.length})</span>
          </h2>
          <p className="subtle">
            Ordenado pelo risco: vazadas e sites perigosos primeiro. Rode "Verificar segurança" na Visão geral para incluir
            vazamentos e sites perigosos.
          </p>
        </div>
        {queue.length === 0 ? (
          <p className="empty">
            <Icon name="check" /> Nenhuma credencial precisa de troca agora.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Motivo</th>
                  <th>
                    <span className="sr-only">Ação</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {queue.map(({ item, risks }) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.data.title}</strong>
                      <small className="subtle block">
                        {typeLabel(item.data.type)}
                        {item.data.username ? ` · ${item.data.username}` : ''}
                      </small>
                    </td>
                    <td>
                      <div className="badges">
                        {risks.map((r) => (
                          <span key={r} className={`badge ${RISK_BADGE[r]}`}>
                            {RISK_LABELS[r]}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <div className="row-actions">
                        {item.data.type === 'login' ? (
                          <button type="button" className="btn btn--sm btn--primary" onClick={() => onRotate(item)}>
                            <Icon name="refresh" size={14} />
                            Trocar com assistência
                          </button>
                        ) : (
                          <button type="button" className="btn btn--sm" onClick={() => onOpen(item)}>
                            Atualizar valor
                          </button>
                        )}
                      </div>
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
          <p className="eyebrow">Programação</p>
          <h2>Trocas programadas</h2>
          <p className="subtle">Defina o intervalo de troca ao editar um login ou segredo (campo "Troca programada").</p>
        </div>
        {scheduled.length === 0 ? (
          <p className="empty">Nenhum item com troca programada.</p>
        ) : (
          <ul className="list">
            {scheduled.map(({ item, due }) => (
              <li key={item.id}>
                <span>
                  <strong>{item.data.title}</strong>
                  <span className="subtle block">a cada {item.data.rotationIntervalDays} dias</span>
                </span>
                <span className="row">
                  <span className={`badge ${due < 0 ? 'badge--danger' : due <= 7 ? 'badge--warn' : 'badge--ok'}`}>
                    {due < 0 ? `vencida há ${-due} dia(s)` : due === 0 ? 'vence hoje' : `em ${due} dia(s)`}
                  </span>
                  {item.data.type === 'login' && item.access !== 'view' && (
                    <button type="button" className="btn btn--sm" onClick={() => onRotate(item)}>
                      Trocar
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <div>
          <p className="eyebrow">Conectores</p>
          <h2>Catálogo de conectores de rotação</h2>
          <p className="subtle">
            Cada plataforma tem um conector com capacidades e política de senha próprias. O modo de execução define onde a
            troca acontece:
          </p>
        </div>
        <div className="grid grid--2">
          {(Object.keys(EXECUTOR_LABELS) as Executor[]).map((e) => (
            <div key={e} className="alert">
              <span className={`badge ${EXECUTOR_BADGE[e]}`}>{EXECUTOR_LABELS[e].label}</span> {EXECUTOR_LABELS[e].detail}
            </div>
          ))}
        </div>
        {byCategory.map(([category, list]) => (
          <div key={category} className="stack-sm">
            <h3>{CATEGORY_LABELS[category]}</h3>
            <ul className="list">
              {list.map((c) => (
                <li key={c.id}>
                  <span>
                    <strong>{c.name}</strong>
                    <span className="subtle block">{c.description}</span>
                    <span className="subtle block">Requer: {c.requires.join('; ')}</span>
                  </span>
                  <span className="badges nowrap">
                    <span className={`badge ${EXECUTOR_BADGE[c.executor]}`}>{EXECUTOR_LABELS[c.executor].label}</span>
                    <span className={`badge ${c.status === 'available' ? 'badge--ok' : ''}`}>{c.status === 'available' ? 'Disponível' : 'Planejado'}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p className="subtle">
          Conectores automáticos fazem a troca em duas fases (criar ou alterar, verificar e só então revogar a antiga),
          guardam a anterior no histórico e registram cada passo na auditoria. Eles serão liberados um a um, após testes
          contra cada plataforma.
        </p>
      </section>
    </div>
  );
}
