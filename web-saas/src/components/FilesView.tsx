import { type ChangeEvent, type FormEvent, type ReactNode, useCallback, useEffect, useState } from 'react';
import { publicKeyFingerprint } from '../lib/crypto';
import {
  type FileShare,
  type KeyContext,
  type SharedFile,
  type Transfer,
  type UserKeyPair,
  type VaultFile,
  FREE_LIMITS,
  type PlanLimits,
  createTransfer,
  expiryFromHours,
  fetchPlanLimits,
  deleteFile,
  downloadOwnFile,
  downloadSharedFile,
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

type FilesViewProps = {
  getKeyContext: () => KeyContext;
  getKeyPair: () => Promise<UserKeyPair>;
};

type Tab = 'vault' | 'shared' | 'transfers';

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong.');

/** Durations offered for shares and transfers; the server enforces the plan limit regardless. */
export function durationOptions(maxHours: number) {
  const all = [
    { hours: 1, label: '1 hour' },
    { hours: 24, label: '24 hours' },
    { hours: 48, label: '48 hours' },
    { hours: 72, label: '3 days' },
    { hours: 24 * 7, label: '7 days' },
    { hours: 24 * 30, label: '30 days' },
  ];
  return all.filter((o) => o.hours <= maxHours);
}

export function formatExpiry(iso: string | null) {
  if (!iso) return 'no expiry';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'expired';
  const hours = Math.round(ms / 3_600_000);
  return hours < 48 ? `expires in ${Math.max(hours, 1)} h` : `expires ${new Date(iso).toLocaleDateString()}`;
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
      setError(errorText(err));
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
      setError(errorText(err));
    } finally {
      setBusy('');
    }
  };

  const used = usedBytes(own);
  const vaultFiles = own.filter((f) => f.kind === 'vault');

  const onUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    void run(`Encrypting and uploading ${file.name}…`, async () => {
      if (file.size > limits.maxFileBytes) throw new Error(`Files can have at most ${formatBytes(limits.maxFileBytes)}.`);
      if (used + file.size > limits.quotaBytes) throw new Error('Not enough space left on your plan.');
      const added = await uploadVaultFile(getKeyContext(), file);
      setOwn((list) => [added, ...list]);
    });
  };

  return (
    <div className="panel files-panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">End-to-end encrypted</p>
          <h3>Files</h3>
        </div>
        <span className="mini-tag">
          {formatBytes(used)} of {formatBytes(limits.quotaBytes)} used
        </span>
      </div>
      <div className="progress-bar" aria-hidden="true">
        <span className={`usage-${Math.min(10, Math.ceil((used / limits.quotaBytes) * 10))}`} />
      </div>

      <div className="tab-row" role="tablist">
        {(
          [
            ['vault', `My files (${vaultFiles.length})`],
            ['shared', `Shared with me (${shared.length})`],
            ['transfers', `Transfers (${transfers.length})`],
          ] as const
        ).map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={`nav-item ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {busy && <div className="notice">{busy}</div>}
      {error && <div className="form-error">{error}</div>}
      {undecryptable > 0 && <div className="notice warning">{undecryptable} file(s) could not be decrypted and are hidden.</div>}
      {loading && <p className="subheadline">Loading…</p>}

      {!loading && tab === 'vault' && (
        <>
          <label className="primary-button file-pick">
            Upload file (max {formatBytes(limits.maxFileBytes)})
            <input type="file" onChange={onUpload} disabled={Boolean(busy)} hidden />
          </label>
          <p className="subheadline">Files are encrypted on this device before upload. Only you (and people you share with) can open them.</p>
          <FileList
            files={vaultFiles}
            empty="No files yet."
            actions={(file) => (
              <>
                <button type="button" className="ghost-button" disabled={Boolean(busy)} onClick={() => void run('Downloading and decrypting…', () => downloadOwnFile(getKeyContext(), file))}>
                  Download
                </button>
                <button type="button" className="ghost-button" onClick={() => setSharing(file)}>
                  Share
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  disabled={Boolean(busy)}
                  onClick={() => {
                    if (!window.confirm(`Delete "${file.meta.name}"? People you shared it with lose access.`)) return;
                    void run('Deleting…', async () => {
                      await deleteFile(file);
                      setOwn((list) => list.filter((f) => f.id !== file.id));
                    });
                  }}
                >
                  Delete
                </button>
              </>
            )}
          />
        </>
      )}

      {!loading && tab === 'shared' && (
        <>
          <p className="subheadline">
            Your sharing key fingerprint: <code>{fingerprint}</code>. People sharing with you can compare it to make sure
            they encrypt for you.
          </p>
          <FileList
            files={shared}
            empty="Nothing has been shared with you yet."
            detail={(file) => `from ${(file as SharedFile).ownerEmail} · ${formatExpiry((file as SharedFile).shareExpiresAt)}`}
            actions={(file) => (
              <>
                <button
                  type="button"
                  className="ghost-button"
                  disabled={Boolean(busy)}
                  onClick={() => void run('Downloading and decrypting…', async () => downloadSharedFile(getKeyContext(), await getKeyPair(), file as SharedFile))}
                >
                  Download
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  disabled={Boolean(busy)}
                  onClick={() =>
                    void run('Removing…', async () => {
                      await removeShare((file as SharedFile).shareId);
                      setShared((list) => list.filter((f) => f.shareId !== (file as SharedFile).shareId));
                    })
                  }
                >
                  Remove
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
            await run(`Encrypting and uploading ${file.name}…`, async () => {
              if (file.size > limits.maxFileBytes) throw new Error(`Files can have at most ${formatBytes(limits.maxFileBytes)}.`);
              if (used + file.size > limits.quotaBytes) throw new Error('Not enough space left on your plan.');
              const result = await createTransfer(getKeyContext(), file, options);
              link = result.link;
              setTransfers((list) => [result.transfer, ...list]);
              setOwn((list) => [result.file, ...list]);
            });
            return link;
          }}
          onRevoke={(t) =>
            void run('Revoking…', async () => {
              await revokeTransfer(t.id);
              setTransfers((list) => list.map((x) => (x.id === t.id ? { ...x, revoked: true } : x)));
            })
          }
        />
      )}

      {sharing && <ShareDialog file={sharing} limits={limits} getKeyContext={getKeyContext} onClose={() => setSharing(null)} />}
    </div>
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
  if (files.length === 0) return <p className="empty-state">{empty}</p>;
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Size</th>
            <th>Added</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {files.map((file) => (
            <tr key={'shareId' in file ? (file as SharedFile).shareId : file.id}>
              <td>
                <strong>{file.meta.name}</strong>
                {detail && <small className="file-detail">{detail(file)}</small>}
              </td>
              <td>{formatBytes(file.meta.size)}</td>
              <td>{new Date(file.createdAt).toLocaleDateString()}</td>
              <td className="row-actions">{actions(file)}</td>
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
      setError(errorText(err));
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
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const lookup = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const found = await findRecipient(email);
      if (!found) throw new Error('No SecureVault user with a sharing key was found for that email. They must sign in and open Files once.');
      setCandidate({ ...found, fingerprint: await publicKeyFingerprint(found.publicKey) });
    });
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <div className="modal-head">
          <div>
            <p className="eyebrow">Share securely</p>
            <h3>{file.meta.name}</h3>
          </div>
          <button type="button" className="ghost-button" onClick={onClose}>
            Close
          </button>
        </div>

        {!candidate ? (
          <form className="form-grid" onSubmit={lookup}>
            <label>
              Recipient email (must have a SecureVault account)
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label>
              Access expires after
              <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
                {options.map((o) => (
                  <option key={o.hours} value={o.hours}>
                    {o.label}
                  </option>
                ))}
                {limits.plan === 'premium' && <option value={0}>No expiry</option>}
              </select>
            </label>
            {limits.plan === 'free' && <p className="subheadline">Free plan: shares last up to 48 hours. Premium allows custom durations.</p>}
            <div className="form-actions">
              <button type="submit" className="primary-button" disabled={busy}>
                Find
              </button>
            </div>
          </form>
        ) : (
          <div className="form-grid">
            <p>
              The file key will be encrypted with {email}&apos;s public key. Ask them for their fingerprint (Files → Shared
              with me) and compare:
            </p>
            <code className="fingerprint">{candidate.fingerprint}</code>
            <div className="form-actions">
              <button
                type="button"
                className="primary-button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await shareFile(getKeyContext(), file, candidate, hours === 0 ? null : expiryFromHours(hours));
                    setInfo(`Shared with ${email} (${hours === 0 ? 'no expiry' : options.find((o) => o.hours === hours)?.label}).`);
                    setCandidate(null);
                    setEmail('');
                    await refresh();
                  })
                }
              >
                Confirm and share
              </button>
              <button type="button" className="ghost-button" onClick={() => setCandidate(null)}>
                Back
              </button>
            </div>
          </div>
        )}

        {info && <div className="notice success">{info}</div>}
        {error && <div className="form-error">{error}</div>}

        <h4>Shared with</h4>
        {shares.length === 0 ? (
          <p className="empty-state">Not shared with anyone.</p>
        ) : (
          <ul className="share-list">
            {shares.map((s) => (
              <li key={s.id}>
                <span>
                  {s.recipientEmail ?? s.recipientId} <small className="file-detail">{formatExpiry(s.expiresAt)}</small>
                </span>
                <button
                  type="button"
                  className="ghost-button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await removeShare(s.id);
                      await refresh();
                    })
                  }
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="notice">Revoking stops future downloads. It cannot erase copies the person already downloaded.</p>
      </div>
    </div>
  );
}

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
    const result = await onCreate(file, { hours, maxDownloads, password: password || null });
    if (result) {
      setLink(result);
      setFile(null);
      setPassword('');
    }
  };

  const now = Date.now();
  return (
    <>
      <form className="form-grid" onSubmit={submit}>
        <label>
          File to send (max {formatBytes(limits.maxFileBytes)})
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
        </label>
        <label>
          Link expires after
          <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
            {options.map((o) => (
              <option key={o.hours} value={o.hours}>
                {o.label}
              </option>
            ))}
          </select>
          {limits.plan === 'free' && <small className="file-detail">Free plan: up to 48 hours. Premium allows longer links.</small>}
        </label>
        <label>
          Maximum downloads (1–20)
          <input type="number" min={1} max={20} value={maxDownloads} onChange={(e) => setMaxDownloads(Number(e.target.value))} />
        </label>
        <label>
          Password (optional, send it through a different channel)
          <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <div className="form-actions">
          <button type="submit" className="primary-button" disabled={busy || !file}>
            Create transfer link
          </button>
        </div>
      </form>

      {link && (
        <div className="notice success">
          <p>
            Anyone with this link can download the file until it expires or runs out of downloads. The decryption key is in
            the part after <code>#</code>, which is never sent to our servers.
          </p>
          <div className="password-output">
            <span className="transfer-link">{link}</span>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p>The link is shown only now. If you lose it, create a new transfer.</p>
        </div>
      )}

      {transfers.length === 0 ? (
        <p className="empty-state">No transfers yet.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>File</th>
                <th>Downloads</th>
                <th>Expires</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {transfers.map((t) => {
                const expired = new Date(t.expiresAt).getTime() <= now;
                const used = t.downloadCount >= t.maxDownloads;
                const status = t.revoked ? 'Revoked' : expired ? 'Expired' : used ? 'Used up' : 'Active';
                return (
                  <tr key={t.id}>
                    <td>
                      {t.fileName}
                      {t.hasPassword && <small className="file-detail">password protected</small>}
                    </td>
                    <td>
                      {t.downloadCount} / {t.maxDownloads}
                    </td>
                    <td>{new Date(t.expiresAt).toLocaleString()}</td>
                    <td>
                      <span className={`status-pill ${status === 'Active' ? 'healthy' : 'review'}`}>{status}</span>
                    </td>
                    <td className="row-actions">
                      {status === 'Active' && (
                        <button type="button" className="ghost-button" disabled={busy} onClick={() => onRevoke(t)}>
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
