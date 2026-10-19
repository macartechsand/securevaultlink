import { type ChangeEvent, type FormEvent, type ReactNode, useCallback, useEffect, useState } from 'react';
import { publicKeyFingerprint } from '../lib/crypto';
import { formatBytes, formatDate, formatDateTime, friendlyError } from '../lib/messages';
import {
  type FileShare,
  type KeyContext,
  type PlanLimits,
  type SharedFile,
  type Transfer,
  type UserKeyPair,
  type VaultFile,
  FREE_LIMITS,
  createTransfer,
  deleteFile,
  downloadOwnFile,
  downloadSharedFile,
  expiryFromHours,
  fetchPlanLimits,
  findRecipient,
  listOwnFiles,
  listSharedWithMe,
  listSharesForFile,
  listTransfers,
  removeShare,
  revokeTransfer,
  shareFile,
  uploadVaultFile,
  usedBytes,
} from '../services/fileService';
import { Icon } from './ui/Icon';

type FilesViewProps = {
  getKeyContext: () => KeyContext;
  getKeyPair: () => Promise<UserKeyPair>;
};

type Tab = 'vault' | 'shared' | 'transfers';

/** Durations offered for shares and transfers; the server enforces the plan limit regardless. */
export function durationOptions(maxHours: number) {
  const all = [
    { hours: 1, label: '1 hora' },
    { hours: 24, label: '24 horas' },
    { hours: 48, label: '48 horas' },
    { hours: 72, label: '3 dias' },
    { hours: 24 * 7, label: '7 dias' },
    { hours: 24 * 30, label: '30 dias' },
  ];
  return all.filter((o) => o.hours <= maxHours);
}

export function formatExpiry(iso: string | null) {
  if (!iso) return 'sem expiração';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'expirado';
  const hours = Math.round(ms / 3_600_000);
  return hours < 48 ? `expira em ${Math.max(hours, 1)} h` : `expira em ${formatDate(iso)}`;
}

function usageClass(used: number, quota: number) {
  const step = Math.min(10, Math.ceil((used / Math.max(quota, 1)) * 10));
  return { width: `w-${step}`, tone: step >= 9 ? 'meter--danger' : step >= 7 ? 'meter--warn' : '' };
}

export function FilesView({ getKeyContext, getKeyPair }: FilesViewProps) {
  const [tab, setTab] = useState<Tab>('vault');
  const [own, setOwn] = useState<VaultFile[]>([]);
  const [shared, setShared] = useState<SharedFile[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [undecryptable, setUndecryptable] = useState(0);
  const [fingerprint, setFingerprint] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [sharing, setSharing] = useState<VaultFile | null>(null);
  const [limits, setLimits] = useState<PlanLimits>(FREE_LIMITS);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const ctx = getKeyContext();
      const keys = await getKeyPair();
      setLimits(await fetchPlanLimits());
      const [mine, sharedWithMe] = await Promise.all([listOwnFiles(ctx), listSharedWithMe(ctx, keys)]);
      setOwn(mine.files);
      setShared(sharedWithMe.files);
      setUndecryptable(mine.undecryptable + sharedWithMe.undecryptable);
      setTransfers(await listTransfers(mine.files));
      setFingerprint(await publicKeyFingerprint(keys.publicKey));
    } catch (err) {
      setError(friendlyError(err, 'Não foi possível carregar os arquivos.'));
    } finally {
      setLoading(false);
    }
  }, [getKeyContext, getKeyPair]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (label: string, action: () => Promise<void>) => {
    setError('');
    setBusy(label);
    try {
      await action();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy('');
    }
  };

  const used = usedBytes(own);
  const vaultFiles = own.filter((f) => f.kind === 'vault');
  const usage = usageClass(used, limits.quotaBytes);

  const checkSize = (file: File) => {
    if (file.size > limits.maxFileBytes) throw new Error(`O arquivo pode ter no máximo ${formatBytes(limits.maxFileBytes)}.`);
    if (used + file.size > limits.quotaBytes) throw new Error('Espaço insuficiente no seu plano.');
  };

  const onUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    void run(`Criptografando e enviando ${file.name}…`, async () => {
      checkSize(file);
      const added = await uploadVaultFile(getKeyContext(), file);
      setOwn((list) => [added, ...list]);
    });
  };

  return (
    <section className="card">
      <div className="card__header">
        <div>
          <p className="eyebrow">Criptografia de ponta a ponta</p>
          <h2>Arquivos</h2>
        </div>
        <div className="stack-sm usage">
          <span className="subtle">
            {formatBytes(used)} de {formatBytes(limits.quotaBytes)} usados · plano {limits.plan === 'premium' ? 'Premium' : 'Gratuito'}
            {limits.planExpiresAt && ` até ${formatDate(limits.planExpiresAt)}`}
          </span>
          <div className={`meter ${usage.tone}`} aria-hidden="true">
            <span className={usage.width} />
          </div>
        </div>
      </div>

      <div className="tabs" role="tablist">
        {(
          [
            ['vault', `Meus arquivos (${vaultFiles.length})`],
            ['shared', `Compartilhados comigo (${shared.length})`],
            ['transfers', `Transferências (${transfers.length})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`tab ${tab === key ? 'is-active' : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {busy && <div className="alert alert--info">{busy}</div>}
      {error && <div className="alert alert--error">{error}</div>}
      {undecryptable > 0 && (
        <div className="alert alert--warn">{undecryptable} arquivo(s) não puderam ser descriptografados e estão ocultos.</div>
      )}
      {loading && <p className="muted">Carregando…</p>}

      {!loading && tab === 'vault' && (
        <>
          <div className="row-between">
            <p className="subtle">
              Os arquivos são criptografados neste dispositivo antes do envio. Só você (e quem receber um compartilhamento)
              consegue abri-los.
            </p>
            <label className={`btn btn--primary file-pick ${busy ? 'is-disabled' : ''}`}>
              <Icon name="upload" />
              Enviar arquivo (até {formatBytes(limits.maxFileBytes)})
              <input type="file" onChange={onUpload} disabled={Boolean(busy)} hidden />
            </label>
          </div>
          <FileList
            files={vaultFiles}
            empty="Nenhum arquivo ainda."
            actions={(file) => (
              <>
                <button
                  type="button"
                  className="btn btn--ghost icon-btn"
                  disabled={Boolean(busy)}
                  aria-label="Baixar"
                  title="Baixar"
                  onClick={() => void run('Baixando e descriptografando…', () => downloadOwnFile(getKeyContext(), file))}
                >
                  <Icon name="download" />
                </button>
                <button type="button" className="btn btn--ghost icon-btn" aria-label="Compartilhar" title="Compartilhar" onClick={() => setSharing(file)}>
                  <Icon name="share" />
                </button>
                <button
                  type="button"
                  className="btn btn--ghost icon-btn btn--danger"
                  disabled={Boolean(busy)}
                  aria-label="Excluir"
                  title="Excluir"
                  onClick={() => {
                    if (!window.confirm(`Excluir "${file.meta.name}"? Quem recebeu um compartilhamento perde o acesso.`)) return;
                    void run('Excluindo…', async () => {
                      await deleteFile(file);
                      setOwn((list) => list.filter((f) => f.id !== file.id));
                    });
                  }}
                >
                  <Icon name="trash" />
                </button>
              </>
            )}
          />
        </>
      )}

      {!loading && tab === 'shared' && (
        <>
          <div className="alert alert--info">
            Impressão digital da sua chave de compartilhamento: <code>{fingerprint}</code>
            <br />
            Quem for compartilhar com você pode compará-la para garantir que está criptografando para você.
          </div>
          <FileList
            files={shared}
            empty="Nada foi compartilhado com você ainda."
            detail={(file) => `de ${(file as SharedFile).ownerEmail} · ${formatExpiry((file as SharedFile).shareExpiresAt)}`}
            actions={(file) => (
              <>
                <button
                  type="button"
                  className="btn btn--ghost icon-btn"
                  disabled={Boolean(busy)}
                  aria-label="Baixar"
                  title="Baixar"
                  onClick={() =>
                    void run('Baixando e descriptografando…', async () =>
                      downloadSharedFile(getKeyContext(), await getKeyPair(), file as SharedFile),
                    )
                  }
                >
                  <Icon name="download" />
                </button>
                <button
                  type="button"
                  className="btn btn--ghost icon-btn"
                  disabled={Boolean(busy)}
                  aria-label="Remover da minha lista"
                  title="Remover da minha lista"
                  onClick={() =>
                    void run('Removendo…', async () => {
                      await removeShare((file as SharedFile).shareId);
                      setShared((list) => list.filter((f) => f.shareId !== (file as SharedFile).shareId));
                    })
                  }
                >
                  <Icon name="close" />
                </button>
              </>
            )}
          />
        </>
      )}

      {!loading && tab === 'transfers' && (
        <TransfersTab
          transfers={transfers}
          limits={limits}
          busy={Boolean(busy)}
          onCreate={async (file, options) => {
            let link = '';
            await run(`Criptografando e enviando ${file.name}…`, async () => {
              checkSize(file);
              const result = await createTransfer(getKeyContext(), file, options);
              link = result.link;
              setTransfers((list) => [result.transfer, ...list]);
              setOwn((list) => [result.file, ...list]);
            });
            return link;
          }}
          onRevoke={(t) =>
            void run('Revogando…', async () => {
              await revokeTransfer(t.id);
              setTransfers((list) => list.map((x) => (x.id === t.id ? { ...x, revoked: true } : x)));
            })
          }
        />
      )}

      {sharing && <ShareDialog file={sharing} limits={limits} getKeyContext={getKeyContext} onClose={() => setSharing(null)} />}
    </section>
  );
}

function FileList({
  files,
  empty,
  actions,
  detail,
}: {
  files: VaultFile[];
  empty: string;
  actions: (file: VaultFile) => ReactNode;
  detail?: (file: VaultFile) => string;
}) {
  if (files.length === 0) return <p className="empty">{empty}</p>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Tamanho</th>
            <th>Adicionado</th>
            <th>
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {files.map((file) => (
            <tr key={'shareId' in file ? (file as SharedFile).shareId : file.id}>
              <td>
                <div className="cell-title">
                  <span className="avatar">
                    <Icon name="file" size={16} />
                  </span>
                  <div>
                    <strong>{file.meta.name}</strong>
                    {detail && <small>{detail(file)}</small>}
                  </div>
                </div>
              </td>
              <td className="nowrap">{formatBytes(file.meta.size)}</td>
              <td className="nowrap">{formatDate(file.createdAt)}</td>
              <td>
                <div className="row-actions">{actions(file)}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ShareDialog({
  file,
  limits,
  getKeyContext,
  onClose,
}: {
  file: VaultFile;
  limits: PlanLimits;
  getKeyContext: () => KeyContext;
  onClose: () => void;
}) {
  const [email, setEmail] = useState('');
  const options = durationOptions(limits.maxShareHours);
  // 0 = no expiry (premium only).
  const [hours, setHours] = useState(Math.min(48, limits.maxShareHours));
  const [candidate, setCandidate] = useState<{ userId: string; publicKey: string; fingerprint: string } | null>(null);
  const [shares, setShares] = useState<FileShare[]>([]);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setShares(await listSharesForFile(file.id));
    } catch (err) {
      setError(friendlyError(err));
    }
  }, [file.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (action: () => Promise<void>) => {
    setError('');
    setInfo('');
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const lookup = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const found = await findRecipient(email);
      if (!found) {
        throw new Error(
          'Nenhum usuário do SecureLink Vault encontrado com esse e-mail. Confira o endereço: a pessoa precisa ter conta e ter desbloqueado o cofre ao menos uma vez.',
        );
      }
      setCandidate({ ...found, fingerprint: await publicKeyFingerprint(found.publicKey) });
    });
  };

  const durationLabel = hours === 0 ? 'sem expiração' : options.find((o) => o.hours === hours)?.label;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="share-title">
      <div className="modal">
        <div className="card__header">
          <div>
            <p className="eyebrow">Compartilhar com segurança</p>
            <h2 id="share-title">{file.meta.name}</h2>
          </div>
          <button type="button" className="btn btn--ghost icon-btn" onClick={onClose} aria-label="Fechar">
            <Icon name="close" />
          </button>
        </div>

        {!candidate ? (
          <form className="form" onSubmit={lookup}>
            <label className="field">
              E-mail do destinatário
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
              <span className="field__hint">A pessoa precisa ter uma conta no SecureLink Vault.</span>
            </label>
            <label className="field">
              O acesso expira em
              <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
                {options.map((o) => (
                  <option key={o.hours} value={o.hours}>
                    {o.label}
                  </option>
                ))}
                {limits.plan === 'premium' && <option value={0}>Sem expiração</option>}
              </select>
              {limits.plan === 'free' && (
                <span className="field__hint">Plano gratuito: compartilhamentos duram até 48 horas. O Premium permite prazos personalizados.</span>
              )}
            </label>
            <div className="form__actions">
              <button type="submit" className="btn btn--primary" disabled={busy}>
                Buscar destinatário
              </button>
            </div>
          </form>
        ) : (
          <div className="stack">
            <p>
              A chave do arquivo será criptografada com a chave pública de <strong>{email}</strong>. Peça a impressão
              digital dessa pessoa (Arquivos → Compartilhados comigo) e compare antes de confirmar:
            </p>
            <div className="fingerprint">{candidate.fingerprint}</div>
            <p className="subtle">Duração: {durationLabel}</p>
            <div className="form__actions">
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await shareFile(getKeyContext(), file, candidate, hours === 0 ? null : expiryFromHours(hours));
                    setInfo(`Compartilhado com ${email} (${durationLabel}).`);
                    setCandidate(null);
                    setEmail('');
                    await refresh();
                  })
                }
              >
                Confirmar e compartilhar
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setCandidate(null)}>
                Voltar
              </button>
            </div>
          </div>
        )}

        {info && <div className="alert alert--ok">{info}</div>}
        {error && <div className="alert alert--error">{error}</div>}

        <div>
          <h3>Compartilhado com</h3>
          {shares.length === 0 ? (
            <p className="empty">Ainda não compartilhado com ninguém.</p>
          ) : (
            <ul className="list">
              {shares.map((s) => (
                <li key={s.id}>
                  <span>
                    {s.recipientEmail ?? s.recipientId}
                    <span className="subtle"> · {formatExpiry(s.expiresAt)}</span>
                  </span>
                  <button
                    type="button"
                    className="btn btn--sm btn--danger"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await removeShare(s.id);
                        await refresh();
                      })
                    }
                  >
                    Revogar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="subtle">Revogar impede novos downloads, mas não apaga cópias que a pessoa já baixou.</p>
      </div>
    </div>
  );
}

const STATUS_BADGE: Record<string, string> = {
  Ativa: 'badge--ok',
  Revogada: 'badge--danger',
  Expirada: '',
  Esgotada: 'badge--warn',
};

function TransfersTab({
  transfers,
  limits,
  busy,
  onCreate,
  onRevoke,
}: {
  transfers: Transfer[];
  limits: PlanLimits;
  busy: boolean;
  onCreate: (file: File, options: { hours: number; maxDownloads: number; password: string | null }) => Promise<string>;
  onRevoke: (t: Transfer) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const options = durationOptions(limits.maxTransferHours);
  const [hours, setHours] = useState(Math.min(48, limits.maxTransferHours));
  const [maxDownloads, setMaxDownloads] = useState(3);
  const [password, setPassword] = useState('');
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) return;
    setLink('');
    setCopied(false);
    const result = await onCreate(file, { hours, maxDownloads, password: password || null });
    if (result) {
      setLink(result);
      setFile(null);
      setPassword('');
    }
  };

  const now = Date.now();
  return (
    <div className="stack">
      <form className="form" onSubmit={submit}>
        <div className="grid grid--2">
          <label className="field">
            Arquivo para enviar (até {formatBytes(limits.maxFileBytes)})
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
          </label>
          <label className="field">
            O link expira em
            <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
              {options.map((o) => (
                <option key={o.hours} value={o.hours}>
                  {o.label}
                </option>
              ))}
            </select>
            {limits.plan === 'free' && <span className="field__hint">Plano gratuito: até 48 horas. O Premium permite links mais longos.</span>}
          </label>
          <label className="field">
            Máximo de downloads (1–20)
            <input type="number" min={1} max={20} value={maxDownloads} onChange={(e) => setMaxDownloads(Number(e.target.value))} />
          </label>
          <label className="field">
            Senha (opcional)
            <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <span className="field__hint">Envie a senha por outro canal, nunca junto com o link.</span>
          </label>
        </div>
        <div className="form__actions">
          <button type="submit" className="btn btn--primary" disabled={busy || !file}>
            <Icon name="link" />
            Criar link de transferência
          </button>
        </div>
      </form>

      {link && (
        <div className="alert alert--ok stack-sm">
          <span>
            Quem tiver este link consegue baixar o arquivo até expirar ou esgotar os downloads. A chave de descriptografia
            fica na parte depois do <code>#</code>, que nunca é enviada aos nossos servidores.
          </span>
          <div className="secret-box">
            <code>{link}</code>
            <button
              type="button"
              className="btn btn--sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              <Icon name={copied ? 'check' : 'copy'} size={16} />
              {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          <span className="subtle">O link aparece só agora. Se perdê-lo, crie uma nova transferência.</span>
        </div>
      )}

      {transfers.length === 0 ? (
        <p className="empty">Nenhuma transferência ainda.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Arquivo</th>
                <th>Downloads</th>
                <th>Expira em</th>
                <th>Status</th>
                <th>
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((t) => {
                const expired = new Date(t.expiresAt).getTime() <= now;
                const usedUp = t.downloadCount >= t.maxDownloads;
                const status = t.revoked ? 'Revogada' : expired ? 'Expirada' : usedUp ? 'Esgotada' : 'Ativa';
                return (
                  <tr key={t.id}>
                    <td>
                      <div className="cell-title">
                        <div>
                          <strong>{t.fileName}</strong>
                          {t.hasPassword && <small>protegido por senha</small>}
                        </div>
                      </div>
                    </td>
                    <td>
                      {t.downloadCount} / {t.maxDownloads}
                    </td>
                    <td className="nowrap">{formatDateTime(t.expiresAt)}</td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[status]}`}>{status}</span>
                    </td>
                    <td>
                      <div className="row-actions">
                        {status === 'Ativa' && (
                          <button type="button" className="btn btn--sm btn--danger" disabled={busy} onClick={() => onRevoke(t)}>
                            Revogar
                          </button>
                        )}
                      </div>
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
