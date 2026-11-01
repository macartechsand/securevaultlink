import { type FormEvent, useEffect, useState } from 'react';
import type { FileMetadata } from '../lib/crypto';
import { formatBytes, formatDateTime, friendlyError } from '../lib/messages';
import { type TransferInfo, downloadTransfer, fetchTransferInfo, unlockTransfer } from '../services/fileService';
import { CenterLayout } from './ui/CenterLayout';
import { Icon } from './ui/Icon';

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
      setError('Este link está incompleto: falta a chave de descriptografia (a parte depois do #).');
      return;
    }
    fetchTransferInfo(transferId)
      .then(async (data) => {
        setInfo(data);
        if (!data.passwordSalt) setOpened(await unlockTransfer(transferId, linkSecret, data, null));
      })
      .catch((err) => setError(friendlyError(err, 'Esta transferência não está disponível.')));
  }, [transferId, linkSecret]);

  const unlock = async (event: FormEvent) => {
    event.preventDefault();
    if (!info) return;
    setError('');
    setBusy(true);
    try {
      setOpened(await unlockTransfer(transferId, linkSecret, info, password));
    } catch {
      setError('Senha incorreta.');
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
      setError(friendlyError(err, 'Falha no download.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <CenterLayout>
      <div>
        <p className="eyebrow">Transferência segura</p>
        <h2>{opened ? opened.meta.name : 'Alguém enviou um arquivo para você'}</h2>
        {opened && info && (
          <p className="subtle">
            {formatBytes(opened.meta.size)} · {info.remainingDownloads} download(s) restante(s) · expira em{' '}
            {formatDateTime(info.expiresAt)}
          </p>
        )}
      </div>

      {info?.passwordSalt && !opened && (
        <form className="form" onSubmit={unlock}>
          <label className="field">
            Senha da transferência
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus required />
            <span className="field__hint">Quem enviou o arquivo deve ter passado a senha por outro canal.</span>
          </label>
          <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
            {busy ? 'Verificando…' : 'Desbloquear'}
          </button>
        </form>
      )}

      {opened && !done && (
        <button type="button" className="btn btn--primary btn--block" disabled={busy} onClick={download}>
          <Icon name="download" />
          {busy ? 'Baixando e descriptografando…' : 'Baixar arquivo'}
        </button>
      )}
      {done && <div className="alert alert--ok">Arquivo baixado e descriptografado no seu dispositivo.</div>}
      {!info && !error && <p className="muted">Carregando…</p>}
      {error && <div className="alert alert--error">{error}</div>}
      <p className="subtle">
        O arquivo é descriptografado no seu navegador; o servidor nunca teve a chave. Só abra arquivos de quem você confia.
      </p>
    </CenterLayout>
  );
}
