import { type ChangeEvent, useState } from 'react';
import type { SecuredItemData } from '../lib/items';
import { friendlyError } from '../lib/messages';
import { type CsvImport, decryptExport, encryptExport, itemsFromCsv } from '../lib/vaultExport';
import { saveToDisk } from '../services/fileService';
import type { Folder, VaultItem } from '../state/itemOps';
import { Icon } from './ui/Icon';

type BackupCardProps = {
  items: VaultItem[];
  folders: Folder[];
  onAddItem: (data: SecuredItemData) => Promise<unknown>;
  onCreateFolder: (name: string) => Promise<Folder>;
};

type Pending = { kind: 'backup' | 'csv'; items: SecuredItemData[]; folderNames: Map<string, string>; detail: string };

/** Encrypted export (portability / own backup) and imports from a backup or another password manager. */
export function BackupCard({ items, folders, onAddItem, onCreateFolder }: BackupCardProps) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [importPassword, setImportPassword] = useState('');
  const [backupText, setBackupText] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [progress, setProgress] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const own = items.filter((i) => i.access === 'owner');

  const run = async (fn: () => Promise<void>) => {
    setError('');
    setInfo('');
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
      setProgress('');
    }
  };

  const doExport = () =>
    run(async () => {
      if (password !== confirm) throw new Error('As senhas de exportação não coincidem.');
      const file = await encryptExport(
        {
          exportedAt: new Date().toISOString(),
          items: own.map((i) => ({ ...i.data, createdAt: i.createdAt })),
          folders: folders.map((f) => ({ id: f.id, name: f.name })),
        },
        password,
      );
      saveToDisk(new TextEncoder().encode(file), `securelink-vault-backup-${new Date().toISOString().slice(0, 10)}.json`);
      setPassword('');
      setConfirm('');
      setInfo(`Backup cifrado gerado com ${own.length} item(ns). Guarde o arquivo e a senha em lugares diferentes.`);
    });

  const readFile = (event: ChangeEvent<HTMLInputElement>, kind: 'backup' | 'csv') => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    void run(async () => {
      if (file.size > 20 * 1024 * 1024) throw new Error('Arquivo grande demais (máximo de 20 MB).');
      const text = await file.text();
      if (kind === 'backup') {
        setBackupText(text);
        setInfo('Backup carregado. Informe a senha usada na exportação.');
        return;
      }
      const parsed: CsvImport = itemsFromCsv(text);
      setPending({
        kind: 'csv',
        items: parsed.items,
        folderNames: new Map(parsed.folders.map((f) => [f, f])),
        detail: `${parsed.items.length} login(s) encontrados (${parsed.source})${parsed.skipped ? `, ${parsed.skipped} linha(s) sem senha ignoradas` : ''}.`,
      });
    });
  };

  const openBackup = () =>
    run(async () => {
      const payload = await decryptExport(backupText, importPassword);
      setImportPassword('');
      setBackupText('');
      setPending({
        kind: 'backup',
        items: payload.items,
        folderNames: new Map(payload.folders.map((f) => [f.id, f.name])),
        detail: `${payload.items.length} item(ns) do backup de ${payload.exportedAt ? new Date(payload.exportedAt).toLocaleString('pt-BR') : 'data desconhecida'}.`,
      });
    });

  const confirmImport = () =>
    run(async () => {
      if (!pending) return;
      // Folders: reuse existing ones by name, create the rest.
      const byName = new Map(folders.map((f) => [f.name.toLowerCase(), f.id]));
      const remap = new Map<string, string>();
      for (const [key, name] of pending.folderNames) {
        let id = byName.get(name.toLowerCase());
        if (!id) {
          id = (await onCreateFolder(name)).id;
          byName.set(name.toLowerCase(), id);
        }
        remap.set(key, id);
      }
      let done = 0;
      for (const item of pending.items) {
        const folderKey = pending.kind === 'backup' ? item.folderId : item.tags.find((t) => pending.folderNames.has(t));
        const data: SecuredItemData = { ...item, folderId: folderKey ? (remap.get(folderKey) ?? null) : null, attachments: [] };
        await onAddItem(data);
        done += 1;
        setProgress(`Importando e criptografando… ${done}/${pending.items.length}`);
      }
      setInfo(
        `${done} item(ns) importados.${pending.kind === 'csv' ? ' Apague o arquivo CSV do seu computador: ele contém senhas em texto puro.' : ''}`,
      );
      setPending(null);
    });

  return (
    <section className="card">
      <div>
        <p className="eyebrow">Backup e migração</p>
        <h2>Exportar e importar</h2>
        <p className="subtle">
          O backup é criptografado no seu navegador com uma senha escolhida agora. Ele inclui os itens que são seus (não os
          compartilhados com você) e as pastas. Os anexos não entram: baixe-os em Arquivos.
        </p>
      </div>

      <div className="grid grid--2">
        <label className="field">
          Senha do backup (mín. 12 caracteres)
          <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="field">
          Confirme a senha
          <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
      </div>
      <div>
        <button type="button" className="btn btn--primary" disabled={busy || !password || own.length === 0} onClick={() => void doExport()}>
          <Icon name="download" />
          Exportar backup cifrado ({own.length})
        </button>
      </div>

      <div className="row">
        <label className={`btn file-pick ${busy ? 'is-disabled' : ''}`}>
          <Icon name="upload" />
          Importar backup do SecureLink
          <input type="file" accept=".json,application/json" hidden onChange={(e) => readFile(e, 'backup')} />
        </label>
        <label className={`btn file-pick ${busy ? 'is-disabled' : ''}`}>
          <Icon name="upload" />
          Importar CSV de outro gerenciador
          <input type="file" accept=".csv,text/csv" hidden onChange={(e) => readFile(e, 'csv')} />
        </label>
      </div>
      <p className="subtle">CSV aceito: Chrome, Edge, Firefox, Bitwarden, 1Password e LastPass (exportação em CSV). O arquivo é lido só no seu navegador.</p>

      {backupText && (
        <div className="field__inline">
          <input type="password" placeholder="Senha usada na exportação" value={importPassword} onChange={(e) => setImportPassword(e.target.value)} />
          <button type="button" className="btn" disabled={busy || !importPassword} onClick={() => void openBackup()}>
            Abrir backup
          </button>
        </div>
      )}

      {pending && (
        <div className="alert alert--info stack-sm">
          <span>{pending.detail}</span>
          <span className="subtle">Os itens serão criptografados e adicionados ao seu cofre (itens existentes não são alterados).</span>
          <div className="row">
            <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={() => void confirmImport()}>
              Importar {pending.items.length} item(ns)
            </button>
            <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => setPending(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      {progress && <div className="alert">{progress}</div>}
      {info && <div className="alert alert--ok">{info}</div>}
      {error && <div className="alert alert--error">{error}</div>}
    </section>
  );
}
