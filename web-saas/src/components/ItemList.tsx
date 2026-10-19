import { useState } from 'react';
import { type ItemHealth, RISK_LABELS } from '../lib/itemHealth';
import { type ItemType, SECRET_KINDS, maskCard, typeLabel } from '../lib/items';
import { STRENGTH_LABELS, strengthBadge } from '../lib/labels';
import { safeHref } from '../lib/urlCheck';
import type { VaultItem } from '../state/itemOps';
import { formatExpiry } from './FilesView';
import { Icon, type IconName } from './ui/Icon';

const TYPE_ICON: Record<ItemType, IconName> = { login: 'key', note: 'note', secret: 'shield', card: 'card' };

async function copyWithClear(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    window.setTimeout(async () => {
      try {
        if ((await navigator.clipboard.readText()) === value) await navigator.clipboard.writeText('');
      } catch {
        /* clipboard read not permitted */
      }
    }, 30_000);
    return true;
  } catch {
    return false;
  }
}

function primarySecret(item: VaultItem) {
  if (item.data.type === 'card') return item.data.card.number;
  if (item.data.type === 'note') return '';
  return item.data.password;
}

function subtitle(item: VaultItem) {
  const d = item.data;
  if (d.type === 'card') return `${maskCard(d.card.number)}${d.card.expiry ? ` · ${d.card.expiry}` : ''}`;
  if (d.type === 'secret') return `${SECRET_KINDS.find((k) => k.value === d.secretKind)?.label ?? 'Segredo'}${d.username ? ` · ${d.username}` : ''}`;
  if (d.type === 'note') return d.notes.slice(0, 60) + (d.notes.length > 60 ? '…' : '');
  return d.username;
}

type ItemListProps = {
  title: string;
  items: VaultItem[];
  health: ItemHealth;
  emptyText: string;
  onNew?: () => void;
  onOpen: (item: VaultItem) => void;
  onShare: (item: VaultItem) => void;
  onDelete: (item: VaultItem) => void;
};

export function ItemList({ title, items, health, emptyText, onNew, onOpen, onShare, onDelete }: ItemListProps) {
  const [copied, setCopied] = useState<string | null>(null);

  return (
    <section className="card">
      <div className="card__header">
        <h2>
          {title} <span className="muted">({items.length})</span>
        </h2>
        {onNew && (
          <button type="button" className="btn btn--primary" onClick={onNew}>
            <Icon name="plus" />
            Novo item
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="empty">{emptyText}</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Tipo</th>
                <th>Saúde e acesso</th>
                <th>
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const d = item.data;
                const href = d.url ? safeHref(d.url) : undefined;
                const strength = health.strengthById.get(item.id);
                const risks = (health.risksById.get(item.id) ?? []).filter((r) => r !== 'weak');
                const secret = primarySecret(item);
                return (
                  <tr key={item.id}>
                    <td>
                      <button type="button" className="cell-title cell-button" onClick={() => onOpen(item)}>
                        <span className="avatar">
                          <Icon name={TYPE_ICON[d.type]} size={16} />
                        </span>
                        <span>
                          <strong>
                            {d.favorite && (
                              <span className="favorite" aria-label="Favorito">
                                <Icon name="star" size={13} />
                              </span>
                            )}
                            {d.title}
                          </strong>
                          <small>{subtitle(item)}</small>
                          {href && (
                            <small>
                              <a href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                                {d.url}
                              </a>
                            </small>
                          )}
                        </span>
                      </button>
                    </td>
                    <td className="nowrap">
                      {typeLabel(d.type)}
                      {d.attachments.length > 0 && <small className="subtle block">{d.attachments.length} anexo(s)</small>}
                    </td>
                    <td>
                      <div className="badges">
                        {strength && <span className={`badge ${strengthBadge(strength)}`}>{STRENGTH_LABELS[strength]}</span>}
                        {risks.map((r) => (
                          <span key={r} className={`badge ${r === 'stale' ? 'badge--warn' : 'badge--danger'}`}>
                            {RISK_LABELS[r]}
                          </span>
                        ))}
                        {item.access === 'owner' && item.sharedWith.length > 0 && (
                          <span className="badge badge--info">
                            <Icon name="users" size={12} />
                            Compartilhado com {item.sharedWith.length}
                          </span>
                        )}
                        {item.access !== 'owner' && (
                          <span className="badge badge--info" title={formatExpiry(item.shareExpiresAt ?? null)}>
                            <Icon name="users" size={12} />
                            De {item.ownerEmail ?? 'outro usuário'} · {item.access === 'edit' ? 'pode editar' : 'leitura'}
                          </span>
                        )}
                        {d.tags.map((t) => (
                          <span key={t} className="badge">
                            {t}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <div className="row-actions">
                        {secret && (
                          <button
                            type="button"
                            className="btn btn--ghost icon-btn"
                            aria-label="Copiar (limpa em 30 s)"
                            title="Copiar (limpa em 30 s)"
                            onClick={async () => {
                              if (await copyWithClear(secret)) {
                                setCopied(item.id);
                                window.setTimeout(() => setCopied((c) => (c === item.id ? null : c)), 2000);
                              }
                            }}
                          >
                            <Icon name={copied === item.id ? 'check' : 'copy'} />
                          </button>
                        )}
                        <button type="button" className="btn btn--ghost icon-btn" aria-label="Abrir" title="Abrir" onClick={() => onOpen(item)}>
                          <Icon name={item.access === 'view' ? 'eye' : 'edit'} />
                        </button>
                        {item.access === 'owner' && (
                          <button type="button" className="btn btn--ghost icon-btn" aria-label="Compartilhar" title="Compartilhar" onClick={() => onShare(item)}>
                            <Icon name="share" />
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn--ghost icon-btn btn--danger"
                          aria-label={item.access === 'owner' ? 'Excluir' : 'Remover da minha lista'}
                          title={item.access === 'owner' ? 'Excluir' : 'Remover da minha lista'}
                          onClick={() => onDelete(item)}
                        >
                          <Icon name={item.access === 'owner' ? 'trash' : 'close'} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
