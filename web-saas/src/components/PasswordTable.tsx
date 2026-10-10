import { useState } from 'react';
import type { PwnedResult } from '../lib/health/pwned';
import type { Strength } from '../lib/health/passwordHealth';
import { safeHref } from '../lib/urlCheck';
import type { UrlReputation } from '../services/urlReputation';
import type { VaultEntry } from '../state/useVaultSession';

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
  } catch {
    /* clipboard unavailable */
  }
}

type PasswordTableProps = {
  items: VaultEntry[];
  strengthById: Map<string, Strength>;
  reusedIds: Set<string>;
  pwnedById: Map<string, PwnedResult>;
  siteById: Map<string, UrlReputation>;
  onAdd: () => void;
  onEdit: (entry: VaultEntry) => void;
  onDelete: (entry: VaultEntry) => void;
};

export function PasswordTable({ items, strengthById, reusedIds, pwnedById, siteById, onAdd, onEdit, onDelete }: PasswordTableProps) {
  const [revealed, setRevealed] = useState<string | null>(null);

  return (
    <div className="table-card">
      <div className="table-header">
        <div>
          <p className="eyebrow">Encrypted vault</p>
          <h3>Entries ({items.length})</h3>
        </div>
        <button type="button" className="primary-button" onClick={onAdd}>
          + Add entry
        </button>
      </div>

      {items.length === 0 ? (
        <p className="empty-state">No entries yet. Add your first credential; it is encrypted before it leaves this device.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Username</th>
                <th>Password</th>
                <th>Category</th>
                <th>Health</th>
                <th aria-label="Actions" />
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
                      <div className="table-title">
                        <span className="tiny-pill">{item.title.slice(0, 2).toUpperCase()}</span>
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
                    <td>{item.category}</td>
                    <td>
                      <span className={`strength ${strength.toLowerCase()}`}>{strength}</span>
                      {reusedIds.has(item.id) && <span className="status-pill review">Reused</span>}
                      {pwned?.status === 'ok' && pwned.count > 0 && (
                        <span className="status-pill at-risk">Exposed ×{pwned.count.toLocaleString()}</span>
                      )}
                      {pwned?.status === 'ok' && pwned.count === 0 && <span className="status-pill healthy">Not found</span>}
                      {pwned?.status === 'error' && <span className="status-pill review">Check failed</span>}
                      {siteById.get(item.id)?.status === 'unsafe' && <span className="status-pill at-risk">Dangerous site</span>}
                    </td>
                    <td className="row-actions">
                      <button type="button" className="ghost-button" onClick={() => setRevealed((r) => (r === item.id ? null : item.id))}>
                        {revealed === item.id ? 'Hide' : 'Show'}
                      </button>
                      <button type="button" className="ghost-button" onClick={() => void copySecret(item.password)}>
                        Copy
                      </button>
                      <button type="button" className="ghost-button" onClick={() => onEdit(item)}>
                        Edit
                      </button>
                      <button type="button" className="ghost-button" onClick={() => onDelete(item)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
