import { useMemo, useState } from 'react';
import { type ItemHealth, RISK_LABELS, type RiskFlag } from '../lib/itemHealth';
import { ITEM_TYPES, type ItemType, matchesQuery } from '../lib/items';
import { friendlyError } from '../lib/messages';
import type { Folder, VaultItem } from '../state/itemOps';
import { ItemList } from './ItemList';
import { Icon } from './ui/Icon';

type SharingFilter = 'all' | 'mine' | 'shared-with-me' | 'shared-by-me';

type VaultViewProps = {
  /** Preselects a risk flag or 'shared-by-me' (used by dashboard recommendations). */
  initialFilter?: string;
  items: VaultItem[];
  folders: Folder[];
  health: ItemHealth;
  query: string;
  onNew: (type?: ItemType) => void;
  onOpen: (item: VaultItem) => void;
  onShare: (item: VaultItem) => void;
  onRotate?: (item: VaultItem) => void;
  onDelete: (item: VaultItem) => void;
  onCreateFolder: (name: string) => Promise<Folder>;
  onRenameFolder: (folder: Folder, name: string) => Promise<void>;
  onDeleteFolder: (folder: Folder) => Promise<void>;
};

export function VaultView({
  initialFilter,
  items,
  folders,
  health,
  query,
  onNew,
  onOpen,
  onShare,
  onRotate,
  onDelete,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
}: VaultViewProps) {
  const [type, setType] = useState<ItemType | 'all'>('all');
  const [folder, setFolder] = useState<string>('all');
  const [tag, setTag] = useState<string>('');
  const [risk, setRisk] = useState<RiskFlag | ''>(initialFilter && initialFilter in RISK_LABELS ? (initialFilter as RiskFlag) : '');
  const [sharing, setSharing] = useState<SharingFilter>(initialFilter === 'shared-by-me' ? 'shared-by-me' : 'all');
  const [favorites, setFavorites] = useState(false);
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const [error, setError] = useState('');

  const tags = useMemo(() => {
    const all = new Map<string, string>();
    for (const i of items) for (const t of i.data.tags) all.set(t.toLowerCase(), t);
    return [...all.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [items]);

  const shown = useMemo(
    () =>
      items.filter((i) => {
        const d = i.data;
        if (type !== 'all' && d.type !== type) return false;
        if (favorites && !d.favorite) return false;
        if (folder === 'none' && d.folderId && folders.some((f) => f.id === d.folderId)) return false;
        if (folder !== 'all' && folder !== 'none' && d.folderId !== folder) return false;
        if (tag && !d.tags.some((t) => t.toLowerCase() === tag.toLowerCase())) return false;
        if (risk && !(health.risksById.get(i.id) ?? []).includes(risk)) return false;
        if (sharing === 'mine' && i.access !== 'owner') return false;
        if (sharing === 'shared-with-me' && i.access === 'owner') return false;
        if (sharing === 'shared-by-me' && !(i.access === 'owner' && i.sharedWith.length > 0)) return false;
        return matchesQuery(d, query);
      }),
    [items, type, favorites, folder, folders, tag, risk, sharing, health, query],
  );

  const count = (pred: (i: VaultItem) => boolean) => items.filter(pred).length;
  const run = async (action: () => Promise<unknown>) => {
    setError('');
    try {
      await action();
    } catch (err) {
      setError(friendlyError(err));
    }
  };
  const activeFilters = type !== 'all' || folder !== 'all' || tag || risk || sharing !== 'all' || favorites;

  return (
    <div className="vault-layout">
      <aside className="card filters" aria-label="Filtros">
        <div className="filters__group">
          <p className="eyebrow">Tipo</p>
          <button type="button" className={`filter ${type === 'all' ? 'is-active' : ''}`} onClick={() => setType('all')}>
            Todos <span>{items.length}</span>
          </button>
          {ITEM_TYPES.map((t) => (
            <button key={t.value} type="button" className={`filter ${type === t.value ? 'is-active' : ''}`} onClick={() => setType(t.value)}>
              {t.label} <span>{count((i) => i.data.type === t.value)}</span>
            </button>
          ))}
          <button type="button" className={`filter ${favorites ? 'is-active' : ''}`} onClick={() => setFavorites((v) => !v)}>
            <span className="row">
              <Icon name="star" size={14} />
              Favoritos
            </span>
            <span>{count((i) => i.data.favorite)}</span>
          </button>
        </div>

        <div className="filters__group">
          <div className="row-between">
            <p className="eyebrow">Pastas</p>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setNewFolder('')} aria-label="Nova pasta">
              <Icon name="plus" size={14} />
            </button>
          </div>
          {newFolder !== null && (
            <form
              className="field__inline"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  const created = await onCreateFolder(newFolder);
                  setNewFolder(null);
                  setFolder(created.id);
                });
              }}
            >
              <input value={newFolder} onChange={(e) => setNewFolder(e.target.value)} placeholder="Nome da pasta" maxLength={60} autoFocus />
              <button type="submit" className="btn btn--sm">
                OK
              </button>
            </form>
          )}
          <button type="button" className={`filter ${folder === 'all' ? 'is-active' : ''}`} onClick={() => setFolder('all')}>
            Todas as pastas
          </button>
          <button type="button" className={`filter ${folder === 'none' ? 'is-active' : ''}`} onClick={() => setFolder('none')}>
            Sem pasta
          </button>
          {folders.map((f) => (
            <div key={f.id} className={`filter filter--folder ${folder === f.id ? 'is-active' : ''}`}>
              <button type="button" className="filter__main" onClick={() => setFolder(f.id)}>
                <Icon name="folder" size={14} />
                {f.name}
                <span>{count((i) => i.data.folderId === f.id)}</span>
              </button>
              <button
                type="button"
                className="btn btn--ghost icon-btn"
                aria-label={`Renomear ${f.name}`}
                onClick={() => {
                  const name = window.prompt('Novo nome da pasta', f.name);
                  if (name) void run(() => onRenameFolder(f, name));
                }}
              >
                <Icon name="edit" size={13} />
              </button>
              <button
                type="button"
                className="btn btn--ghost icon-btn btn--danger"
                aria-label={`Excluir ${f.name}`}
                onClick={() => {
                  if (window.confirm(`Excluir a pasta "${f.name}"? Os itens dela continuam no cofre, sem pasta.`)) {
                    void run(async () => {
                      await onDeleteFolder(f);
                      if (folder === f.id) setFolder('all');
                    });
                  }
                }}
              >
                <Icon name="trash" size={13} />
              </button>
            </div>
          ))}
        </div>

        <div className="filters__group">
          <p className="eyebrow">Risco</p>
          <select value={risk} onChange={(e) => setRisk(e.target.value as RiskFlag | '')} aria-label="Filtrar por risco">
            <option value="">Qualquer</option>
            {(Object.keys(RISK_LABELS) as RiskFlag[]).map((r) => (
              <option key={r} value={r}>
                {RISK_LABELS[r]} ({health.counts[r]})
              </option>
            ))}
          </select>
        </div>

        <div className="filters__group">
          <p className="eyebrow">Compartilhamento</p>
          <select value={sharing} onChange={(e) => setSharing(e.target.value as SharingFilter)} aria-label="Filtrar por compartilhamento">
            <option value="all">Todos</option>
            <option value="mine">Só meus</option>
            <option value="shared-by-me">Compartilhados por mim</option>
            <option value="shared-with-me">Compartilhados comigo</option>
          </select>
        </div>

        {tags.length > 0 && (
          <div className="filters__group">
            <p className="eyebrow">Tags</p>
            <div className="badges">
              {tags.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`badge badge-button ${tag.toLowerCase() === t.toLowerCase() ? 'badge--info' : ''}`}
                  onClick={() => setTag((cur) => (cur.toLowerCase() === t.toLowerCase() ? '' : t))}
                >
                  <Icon name="tag" size={11} />
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        {activeFilters && (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => {
              setType('all');
              setFolder('all');
              setTag('');
              setRisk('');
              setSharing('all');
              setFavorites(false);
            }}
          >
            Limpar filtros
          </button>
        )}
        {error && <div className="alert alert--error">{error}</div>}
      </aside>

      <ItemList
        title={query ? `Resultados para "${query}"` : 'Itens'}
        items={shown}
        health={health}
        emptyText={items.length === 0 ? 'Nenhum item ainda. Tudo é criptografado antes de sair deste dispositivo.' : 'Nenhum item corresponde aos filtros.'}
        onNew={() => onNew(type === 'all' ? undefined : type)}
        onOpen={onOpen}
        onShare={onShare}
        onRotate={onRotate}
        onDelete={onDelete}
      />
    </div>
  );
}
