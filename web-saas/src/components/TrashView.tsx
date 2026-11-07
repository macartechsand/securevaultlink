import { useState } from 'react';
import { friendlyError } from '../lib/messages';
import { TRASH_DAYS } from '../lib/plan';
import type { VaultItem } from '../state/itemOps';
import { Icon } from './ui/Icon';

type TrashViewProps = {
  items: VaultItem[];
  premium: boolean;
  onRestore: (item: VaultItem) => Promise<void>;
  onPurge: (item: VaultItem) => Promise<void>;
};

const DAY_MS = 86_400_000;
const daysLeft = (deletedAt: string, now = Date.now()) => Math.max(0, TRASH_DAYS - Math.floor((now - Date.parse(deletedAt)) / DAY_MS));

/** Items deleted in the last 14 days (Premium). Restore or delete for good. */
export function TrashView({ items, premium, onRestore, onPurge }: TrashViewProps) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const run = async (id: string, fn: () => Promise<void>) => {
    setError('');
    setBusy(id);
    try {
      await fn();
    } catch (err) {
      setError(friendlyError(err, 'Não foi possível concluir a ação.'));
    } finally {
      setBusy('');
    }
  };

  return (
    <section className="card">
      <div className="card__header">
        <div>
          <p className="eyebrow">Lixeira</p>
          <h2>
            Itens excluídos <span className="muted">({items.length})</span>
          </h2>
        </div>
        {items.length > 0 && (
          <button
            type="button"
            className="btn btn--danger btn--sm"
            disabled={Boolean(busy)}
            onClick={() => {
              if (!window.confirm(`Excluir para sempre os ${items.length} item(ns) da lixeira? Não há como desfazer.`)) return;
              void run('all', async () => {
                for (const item of items) await onPurge(item);
              });
            }}
          >
            Esvaziar lixeira
          </button>
        )}
      </div>
      <p className="subtle">
        {premium
          ? `Itens excluídos ficam aqui por ${TRASH_DAYS} dias e depois são apagados para sempre. Na lixeira eles deixam de aparecer para quem você compartilhou.`
          : `A lixeira de ${TRASH_DAYS} dias faz parte do Premium. No plano gratuito, excluir apaga o item na hora. Itens que já estavam aqui podem ser restaurados.`}
      </p>
      {error && <div className="alert alert--error">{error}</div>}
      {items.length === 0 ? (
        <p className="muted">A lixeira está vazia.</p>
      ) : (
        <ul className="plain-list">
          {items.map((item) => (
            <li key={item.id} className="row-between">
              <div>
                <strong>{item.data.title || '(sem título)'}</strong>
                <div className="subtle">
                  {item.deletedAt ? `Apagado para sempre em ${daysLeft(item.deletedAt)} dia(s)` : ''}
                  {item.data.attachments.length > 0 ? ` · ${item.data.attachments.length} anexo(s)` : ''}
                </div>
              </div>
              <div className="row">
                <button type="button" className="btn btn--sm" disabled={Boolean(busy)} onClick={() => void run(item.id, () => onRestore(item))}>
                  <Icon name="refresh" size={14} />
                  Restaurar
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={Boolean(busy)}
                  onClick={() => {
                    if (!window.confirm(`Excluir "${item.data.title}" para sempre?`)) return;
                    void run(item.id, () => onPurge(item));
                  }}
                >
                  <Icon name="trash" size={14} />
                  Excluir
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
