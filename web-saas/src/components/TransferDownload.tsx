import { type FormEvent, useEffect, useState } from 'react';
import type { FileMetadata } from '../lib/crypto';
import { type TransferInfo, downloadTransfer, fetchTransferInfo, unlockTransfer } from '../services/fileService';
import { formatBytes } from './FilesView';

type TransferDownloadProps = { transferId: string; linkSecret: string };

/** Public page for temporary transfers. Decryption happens here, in the recipient's browser. */
export function TransferDownload({ transferId, linkSecret }: TransferDownloadProps) {
  const [info, setInfo] = useState<TransferInfo | null>(null);
  const [opened, setOpened] = useState<{ fileKey: Uint8Array<ArrayBuffer>; meta: FileMetadata } | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!linkSecret) {
      setError('This link is incomplete: the decryption key (after #) is missing.');
      return;
    }
    fetchTransferInfo(transferId)
      .then(async (data) => {
        setInfo(data);
        if (!data.passwordSalt) setOpened(await unlockTransfer(transferId, linkSecret, data, null));
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'This transfer is not available.'));
  }, [transferId, linkSecret]);

  const unlock = async (event: FormEvent) => {
    event.preventDefault();
    if (!info) return;
    setError('');
    setBusy(true);
    try {
      setOpened(await unlockTransfer(transferId, linkSecret, info, password));
    } catch {
      setError('Wrong password.');
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    if (!info || !opened) return;
    setError('');
    setBusy(true);
    try {
      await downloadTransfer(transferId, opened.fileKey, info, opened.meta.name);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-shell">
      <main className="main-panel auth-panel">
        <header className="topbar">
          <div>
            <p className="eyebrow">Secure transfer</p>
            <h1>SecureLink Vault</h1>
          </div>
        </header>
        <section className="page-panel auth-box">
          <p className="eyebrow">End-to-end encrypted</p>
          <h3>{opened ? opened.meta.name : 'Someone sent you a file'}</h3>
          {opened && info && (
            <p className="subheadline">
              {formatBytes(opened.meta.size)} · {info.remainingDownloads} download(s) left · expires{' '}
              {new Date(info.expiresAt).toLocaleString()}
            </p>
          )}

          {info?.passwordSalt && !opened && (
            <form className="form-grid" onSubmit={unlock}>
              <label>
                Password
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus required />
              </label>
              <div className="form-actions">
                <button type="submit" className="primary-button" disabled={busy}>
                  {busy ? 'Checking…' : 'Unlock'}
                </button>
              </div>
            </form>
          )}

          {opened && !done && (
            <div className="form-actions">
              <button type="button" className="primary-button" disabled={busy} onClick={download}>
                {busy ? 'Downloading and decrypting…' : 'Download'}
              </button>
            </div>
          )}
          {done && <div className="notice success">Downloaded and decrypted on your device.</div>}
          {!info && !error && <p className="subheadline">Loading…</p>}
          {error && <div className="form-error">{error}</div>}
          <p className="notice">
            The file is decrypted in your browser. The server never had the key. Only open files from people you trust.
          </p>
        </section>
      </main>
    </div>
  );
}
