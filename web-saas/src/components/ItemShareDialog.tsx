import { type FormEvent, useState } from 'react';
import { publicKeyFingerprint } from '../lib/crypto';
import { friendlyError } from '../lib/messages';
import { type PlanLimits, expiryFromHours, findRecipient } from '../services/fileService';
import type { ItemShareInfo, VaultItem } from '../state/itemOps';
import { durationOptions, formatExpiry } from './FilesView';
import { Icon } from './ui/Icon';

type ItemShareDialogProps = {
  item: VaultItem;
  limits: PlanLimits;
  onShare: (recipient: { userId: string; publicKey: string }, permission: 'view' | 'edit', expiresAt: string | null) => Promise<void>;
  onRevoke: (share: ItemShareInfo) => Promise<void>;
  onSetPermission: (share: ItemShareInfo, permission: 'view' | 'edit') => Promise<void>;
  onClose: () => void;
};

export function ItemShareDialog({ item, limits, onShare, onRevoke, onSetPermission, onClose }: ItemShareDialogProps) {
  const options = durationOptions(limits.maxShareHours);
  const [email, setEmail] = useState('');
  const [permission, setPermission] = useState<'view' | 'edit'>('view');
  const [hours, setHours] = useState(Math.min(48, limits.maxShareHours));
  const [candidate, setCandidate] = useState<{ userId: string; publicKey: string; fingerprint: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

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
          'Nenhum usuário encontrado com esse e-mail. A pessoa precisa ter conta e ter desbloqueado o cofre ao menos uma vez.',
        );
      }
      setCandidate({ ...found, fingerprint: await publicKeyFingerprint(found.publicKey) });
    });
  };

  const durationLabel = hours === 0 ? 'sem expiração' : options.find((o) => o.hours === hours)?.label;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="item-share-title">
      <div className="modal">
        <div className="card__header">
          <div>
            <p className="eyebrow">Compartilhar item</p>
            <h2 id="item-share-title">{item.data.title}</h2>
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
            </label>
            <div className="grid grid--2">
              <label className="field">
                Permissão
                <select value={permission} onChange={(e) => setPermission(e.target.value as 'view' | 'edit')}>
                  <option value="view">Visualizar</option>
                  <option value="edit">Editar</option>
                </select>
                <span className="field__hint">Editar permite alterar o conteúdo. Só você pode compartilhar ou excluir.</span>
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
                {limits.plan === 'free' && <span className="field__hint">Plano gratuito: até 48 horas.</span>}
              </label>
            </div>
            {item.data.attachments.length > 0 && (
              <p className="subtle">Os {item.data.attachments.length} anexo(s) também serão compartilhados (somente leitura).</p>
            )}
            <div className="form__actions">
              <button type="submit" className="btn btn--primary" disabled={busy}>
                Buscar destinatário
              </button>
            </div>
          </form>
        ) : (
          <div className="stack">
            <p>
              A chave deste item será criptografada para <strong>{email}</strong>. Compare a impressão digital com a que a
              pessoa vê em Arquivos → Compartilhados comigo:
            </p>
            <div className="fingerprint">{candidate.fingerprint}</div>
            <p className="subtle">
              Permissão: {permission === 'edit' ? 'editar' : 'visualizar'} · Duração: {durationLabel}
            </p>
            <div className="form__actions">
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await onShare(candidate, permission, hours === 0 ? null : expiryFromHours(hours));
                    setInfo(`Compartilhado com ${email}.`);
                    setCandidate(null);
                    setEmail('');
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
          {item.sharedWith.length === 0 ? (
            <p className="empty">Ainda não compartilhado com ninguém.</p>
          ) : (
            <ul className="list">
              {item.sharedWith.map((s) => (
                <li key={s.id}>
                  <span>
                    {s.recipientEmail}
                    <span className="subtle"> · {formatExpiry(s.expiresAt)}</span>
                  </span>
                  <span className="row">
                    <select
                      className="filter-select"
                      value={s.permission}
                      disabled={busy}
                      aria-label={`Permissão de ${s.recipientEmail}`}
                      onChange={(e) => void run(() => onSetPermission(s, e.target.value as 'view' | 'edit'))}
                    >
                      <option value="view">Visualizar</option>
                      <option value="edit">Editar</option>
                    </select>
                    <button type="button" className="btn btn--sm btn--danger" disabled={busy} onClick={() => void run(() => onRevoke(s))}>
                      Revogar
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="subtle">
          Ao revogar, a chave do item é trocada: a pessoa removida não consegue ler versões futuras. Cópias que ela já viu ou
          baixou não podem ser apagadas.
        </p>
      </div>
    </div>
  );
}
