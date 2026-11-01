import { useEffect, useRef, useState } from 'react';
import { changePasswordUrl, connectorById } from '../lib/connectors';
import { ADMIN_LINKED_CONNECTORS, type SecuredItemData } from '../lib/items';
import { formatDate, friendlyError } from '../lib/messages';
import { generatePassword } from '../lib/passwordGenerator';
import { type RotationResult, revokeOldCredential, rotateCredential } from '../services/rotationService';
import type { VaultItem } from '../state/itemOps';
import { copyWithAutoClear } from './RotateWizard';
import { Icon } from './ui/Icon';

type QuickRotateProps = {
  item: VaultItem;
  /** Set for the one-click assisted mode (logins): the password generated and copied in the click. */
  assistedPassword?: string;
  /** Saves the item; receives an updater so it always applies to the latest copy. */
  onSave: (next: (data: SecuredItemData) => SecuredItemData) => Promise<void>;
  /** Looks up another vault item (the admin access key linked by aws-iam-console). */
  findItem: (id: string) => VaultItem | undefined;
  onClose: () => void;
};

/**
 * Must run inside the click handler: generates the new password, copies it (cleared after 30 s) and
 * opens the site's change-password page. Nothing is saved until the user confirms.
 */
export function startAssistedRotation(item: VaultItem): string {
  const policy = connectorById('web-assisted')!.policy;
  const password = generatePassword({ length: policy.minLength, uppercase: true, numbers: true, symbols: policy.symbols });
  void copyWithAutoClear(password);
  const url = changePasswordUrl(item.data.url);
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
  return password;
}

type Phase = 'rotating' | 'saving' | 'revoking' | 'done' | 'failed' | 'save_failed';

export function QuickRotate({ item, assistedPassword, onSave, findItem, onClose }: QuickRotateProps) {
  return assistedPassword ? (
    <AssistedQuick item={item} password={assistedPassword} onSave={onSave} onClose={onClose} />
  ) : (
    <AutoQuick item={item} onSave={onSave} findItem={findItem} onClose={onClose} />
  );
}

function Shell({ title, eyebrow, onClose, closable = true, children }: { title: string; eyebrow: string; onClose: () => void; closable?: boolean; children: React.ReactNode }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="quick-rotate-title">
      <div className="modal">
        <div className="card__header">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h2 id="quick-rotate-title">{title}</h2>
          </div>
          {closable && (
            <button type="button" className="btn btn--ghost icon-btn" onClick={onClose} aria-label="Fechar">
              <Icon name="close" />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

function AssistedQuick({ item, password, onSave, onClose }: { item: VaultItem; password: string } & Pick<QuickRotateProps, 'onSave' | 'onClose'>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const hasUrl = Boolean(changePasswordUrl(item.data.url));
  const copy = async (label: string, value: string) => {
    if (await copyWithAutoClear(value)) {
      setCopied(label);
      window.setTimeout(() => setCopied((c) => (c === label ? '' : c)), 2000);
    }
  };

  return (
    <Shell eyebrow="Troca em 1 clique" title={`Trocar a senha de ${item.data.title}`} onClose={onClose}>
      <div className="stack">
        <div className="alert alert--ok">
          <Icon name="check" size={14} /> Nova senha forte gerada e <strong>copiada</strong>
          {hasUrl ? ' · página de troca de senha aberta em outra aba.' : '. Este item não tem site salvo: abra a conta manualmente.'}
        </div>
        <p className="muted">
          No site, cole a senha atual e a nova. Volte aqui e confirme: a nova senha só é salva depois disso, e a anterior vai
          para o histórico.
        </p>
        <div className="row">
          <button type="button" className="btn btn--sm" onClick={() => void copy('current', item.data.password)}>
            <Icon name={copied === 'current' ? 'check' : 'copy'} size={14} />
            Copiar senha atual
          </button>
          <button type="button" className="btn btn--sm" onClick={() => void copy('new', password)}>
            <Icon name={copied === 'new' ? 'check' : 'copy'} size={14} />
            Copiar nova senha
          </button>
        </div>
        <p className="subtle">A área de transferência é limpa automaticamente após 30 segundos.</p>
        {error && <div className="alert alert--error">{error}</div>}
        <div className="form__actions">
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                await onSave((d) => ({ ...d, password }));
                onClose();
              } catch (err) {
                setError(friendlyError(err, 'Não foi possível salvar a nova senha.'));
                setBusy(false);
              }
            }}
          >
            {busy ? 'Salvando…' : 'O site aceitou: salvar nova senha'}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
            Cancelar (não troquei)
          </button>
        </div>
      </div>
    </Shell>
  );
}

function AutoQuick({ item, onSave, findItem, onClose }: Omit<QuickRotateProps, 'assistedPassword'>) {
  const auto = item.data.autoRotation!;
  const connector = connectorById(auto.connectorId);
  const [phase, setPhase] = useState<Phase>('rotating');
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [result, setResult] = useState<RotationResult | null>(null);
  const [copied, setCopied] = useState(false);
  const started = useRef(false);

  const persist = async (r: RotationResult) => {
    setPhase('saving');
    try {
      const now = new Date().toISOString();
      await onSave((d) => ({
        ...d,
        password: r.secret,
        username: r.identifier ?? d.username,
        autoRotation: d.autoRotation && {
          ...d.autoRotation,
          config: r.keyId ? { ...d.autoRotation.config, keyId: r.keyId } : d.autoRotation.config,
          lastRotatedAt: now,
          expiresAt: r.expiresAt ?? null,
        },
      }));
    } catch (err) {
      // The platform already holds the new credential: never lose it.
      setError(friendlyError(err, 'Não foi possível salvar no cofre.'));
      setPhase('save_failed');
      return;
    }
    if (r.revokeOldId) {
      setPhase('revoking');
      try {
        await revokeOldCredential(auto, { id: r.identifier ?? item.data.username.trim(), secret: r.secret }, r.revokeOldId, r.keyId);
      } catch (err) {
        setWarning((w) => [w, friendlyError(err)].filter(Boolean).join(' '));
      }
    }
    setPhase('done');
  };

  useEffect(() => {
    // Guard: React StrictMode runs effects twice in development; a rotation must happen once.
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        let r: RotationResult;
        if (ADMIN_LINKED_CONNECTORS[auto.connectorId]) {
          // Only the account name and the linked admin credential are sent; never the current password.
          const adminItem = auto.config.adminItemId ? findItem(auto.config.adminItemId) : undefined;
          if (!adminItem) throw new Error('Vincule, em Editar → Rotação automática, o segredo com a credencial administrativa.');
          r = await rotateCredential(auto, { id: item.data.username.trim(), secret: '' }, { id: adminItem.data.username.trim(), secret: adminItem.data.password });
        } else {
          r = await rotateCredential(auto, { id: item.data.username.trim(), secret: item.data.password });
        }
        if (r.warning) setWarning(r.warning);
        setResult(r);
        await persist(r);
      } catch (err) {
        setError(friendlyError(err));
        setPhase('failed');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const working = phase === 'rotating' || phase === 'saving' || phase === 'revoking';
  const label: Record<Phase, string> = {
    rotating: `Criando e verificando a nova credencial em ${connector?.name ?? 'na plataforma'}…`,
    saving: 'Cifrando e salvando no cofre…',
    revoking: 'Removendo a credencial antiga…',
    done: '',
    failed: '',
    save_failed: '',
  };

  return (
    <Shell eyebrow="Rotação automática" title={`Rotacionar ${item.data.title}`} onClose={onClose} closable={!working && phase !== 'save_failed'}>
      <div className="stack">
        {working && (
          <p className="muted" aria-live="polite">
            <Icon name="refresh" size={14} /> {label[phase]} Não feche esta janela.
          </p>
        )}
        {phase === 'done' && (
          <div className="alert alert--ok" aria-live="polite">
            <Icon name="check" size={14} /> Credencial rotacionada{result?.verified ? ' e verificada' : ''} e salva no cofre. A anterior
            está no histórico do item{result?.revokeOldId && !warning ? ' e já foi removida na plataforma' : ''}.
            {result?.expiresAt ? ` Nova validade: ${formatDate(result.expiresAt)}.` : ''}
          </div>
        )}
        {phase === 'done' && result && !result.verified && !result.warning && (
          <div className="alert alert--warn">A plataforma emitiu a nova credencial, mas a verificação não respondeu. Teste-a antes de usar.</div>
        )}
        {warning && <div className="alert alert--warn">{warning}</div>}
        {phase === 'failed' && <div className="alert alert--error">{error}</div>}
        {phase === 'save_failed' && result && (
          <>
            <div className="alert alert--error">
              A plataforma já trocou a credencial, mas o cofre não salvou ({error}). <strong>Copie a nova credencial agora</strong> ou
              tente salvar de novo antes de fechar.
            </div>
            <div className="row">
              <button
                type="button"
                className="btn btn--sm"
                onClick={async () => {
                  if (await copyWithAutoClear(result.identifier ? `${result.identifier}\n${result.secret}` : result.secret)) setCopied(true);
                }}
              >
                <Icon name={copied ? 'check' : 'copy'} size={14} />
                Copiar nova credencial
              </button>
              <button type="button" className="btn btn--sm btn--primary" onClick={() => void persist(result)}>
                Tentar salvar de novo
              </button>
              <button type="button" className="btn btn--sm btn--ghost" onClick={onClose}>
                Fechar (já copiei)
              </button>
            </div>
          </>
        )}
        {(phase === 'done' || phase === 'failed') && (
          <div className="form__actions">
            <button type="button" className="btn btn--primary" onClick={onClose}>
              Fechar
            </button>
          </div>
        )}
      </div>
    </Shell>
  );
}
