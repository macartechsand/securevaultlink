import { useState } from 'react';
import type { PwnedResult } from '../lib/health/pwned';
import type { Strength } from '../lib/health/passwordHealth';
import { STRENGTH_LABELS, categoryLabel, strengthBadge } from '../lib/labels';
import { safeHref } from '../lib/urlCheck';
import type { UrlReputation } from '../services/urlReputation';
import type { VaultEntry } from '../state/useVaultSession';
import { Icon } from './ui/Icon';

const CLIPBOARD_CLEAR_MS = 30_000;

async function copySecret(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    window.setTimeout(async () => {
      try {
        // Only clear if the clipboard still holds what we copied.
        if ((await navigator.clipboard.readText()) === value) await navigator.clipboard.writeText('');
      } catch {
        /* clipboard read not permitted: leave it */
      }
    }, CLIPBOARD_CLEAR_MS);
    return true;
  } catch {
    return false;
  }
}

type PasswordTableProps = {
  title?: string;
  items: VaultEntry[];
  strengthById: Map<string, Strength>;
  reusedIds: Set<string>;
  pwnedById: Map<string, PwnedResult>;
  siteById: Map<string, UrlReputation>;
  onAdd: () => void;
  onEdit: (entry: VaultEntry) => void;
  onDelete: (entry: VaultEntry) => void;
};

export function PasswordTable({
  title = 'Credenciais',
  items,
  strengthById,
  reusedIds,
  pwnedById,
  siteById,
  onAdd,
  onEdit,
  onDelete,
}: PasswordTableProps) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  return (
    <section className="card">
      <div className="card__header">
        <div>
          <p className="eyebrow">Cofre criptografado</p>
          <h2>
            {title} <span className="muted">({items.length})</span>
          </h2>
        </div>
        <button type="button" className="btn btn--primary" onClick={onAdd}>
          <Icon name="plus" />
          Nova credencial
        </button>
      </div>

      {items.length === 0 ? (
        <p className="empty">Nenhuma credencial ainda. Ela é criptografada antes de sair deste dispositivo.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Título</th>
                <th>Usuário</th>
                <th>Senha</th>
                <th>Categoria</th>
                <th>Saúde</th>
                <th>
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const href = item.url ? safeHref(item.url) : undefined;
                const strength = strengthById.get(item.id) ?? 'Weak';
                const pwned = pwnedById.get(item.id);
                return (
                  <tr key={item.id}>
                    <td>
                      <div className="cell-title">
                        <span className="avatar">{item.title.slice(0, 2).toUpperCase()}</span>
                        <div>
                          <strong>{item.title}</strong>
                          {href ? (
                            <small>
                              <a href={href} target="_blank" rel="noopener noreferrer">
                                {item.url}
                              </a>
                            </small>
                          ) : (
                            item.url && <small>{item.url}</small>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>{item.username}</td>
                    <td>
                      <code>{revealed === item.id ? item.password : '••••••••••'}</code>
                    </td>
                    <td>{categoryLabel(item.category)}</td>
                    <td>
                      <div className="badges">
                        <span className={`badge ${strengthBadge(strength)}`}>{STRENGTH_LABELS[strength]}</span>
                        {reusedIds.has(item.id) && <span className="badge badge--warn">Reutilizada</span>}
                        {pwned?.status === 'ok' && pwned.count > 0 && (
                          <span className="badge badge--danger">Vazada ×{pwned.count.toLocaleString('pt-BR')}</span>
                        )}
                        {pwned?.status === 'ok' && pwned.count === 0 && <span className="badge badge--ok">Não vazada</span>}
                        {pwned?.status === 'error' && <span className="badge">Falha na verificação</span>}
                        {siteById.get(item.id)?.status === 'unsafe' && <span className="badge badge--danger">Site perigoso</span>}
                      </div>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn btn--ghost icon-btn"
                          onClick={() => setRevealed((r) => (r === item.id ? null : item.id))}
                          aria-label={revealed === item.id ? 'Ocultar senha' : 'Mostrar senha'}
                          title={revealed === item.id ? 'Ocultar senha' : 'Mostrar senha'}
                        >
                          <Icon name="eye" />
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost icon-btn"
                          onClick={async () => {
                            if (await copySecret(item.password)) {
                              setCopied(item.id);
                              window.setTimeout(() => setCopied((c) => (c === item.id ? null : c)), 2000);
                            }
                          }}
                          aria-label="Copiar senha (limpa em 30 s)"
                          title="Copiar senha (limpa em 30 s)"
                        >
                          <Icon name={copied === item.id ? 'check' : 'copy'} />
                        </button>
                        <button type="button" className="btn btn--ghost icon-btn" onClick={() => onEdit(item)} aria-label="Editar" title="Editar">
                          <Icon name="edit" />
                        </button>
                        <button type="button" className="btn btn--ghost icon-btn btn--danger" onClick={() => onDelete(item)} aria-label="Excluir" title="Excluir">
                          <Icon name="trash" />
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
