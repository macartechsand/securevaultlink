import { useState } from 'react';
import { changePasswordUrl, connectorById } from '../lib/connectors';
import { passwordStrength } from '../lib/health/passwordHealth';
import { STRENGTH_LABELS, strengthBadge } from '../lib/labels';
import { friendlyError } from '../lib/messages';
import { generatePassword } from '../lib/passwordGenerator';
import { safeHref } from '../lib/urlCheck';
import type { VaultItem } from '../state/itemOps';
import { Icon } from './ui/Icon';

type RotateWizardProps = {
  item: VaultItem;
  onSave: (newPassword: string) => Promise<void>;
  onClose: () => void;
};

/** Copies to the clipboard and clears it after 30 s if it still holds the value. */
export async function copyWithAutoClear(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    window.setTimeout(async () => {
      try {
        if ((await navigator.clipboard.readText()) === value) await navigator.clipboard.writeText('');
      } catch {
        /* ignore */
      }
    }, 30_000);
    return true;
  } catch {
    return false;
  }
}

/**
 * Assisted rotation (works for any site, zero-knowledge): generate → change on the site → confirm.
 * The new password is only saved after the user confirms the change worked; the old one goes to history.
 */
export function RotateWizard({ item, onSave, onClose }: RotateWizardProps) {
  const policy = connectorById('web-assisted')!.policy;
  const [length, setLength] = useState(policy.minLength);
  const [symbols, setSymbols] = useState(policy.symbols);
  const [password, setPassword] = useState(() => generatePassword({ length: policy.minLength, uppercase: true, numbers: true, symbols: true }));
  const [step, setStep] = useState(1);
  const [copied, setCopied] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const regenerate = (next: { length?: number; symbols?: boolean } = {}) => {
    const l = next.length ?? length;
    const s = next.symbols ?? symbols;
    setPassword(generatePassword({ length: l, uppercase: true, numbers: true, symbols: s }));
  };
  const changeUrl = changePasswordUrl(item.data.url);
  const siteUrl = item.data.url ? safeHref(item.data.url) : undefined;
  const strength = passwordStrength(password, [item.data.title, item.data.username]);

  const copyField = async (label: string, value: string) => {
    if (await copyWithAutoClear(value)) {
      setCopied(label);
      window.setTimeout(() => setCopied((c) => (c === label ? '' : c)), 2000);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="rotate-title">
      <div className="modal">
        <div className="card__header">
          <div>
            <p className="eyebrow">Troca assistida · passo {step} de 3</p>
            <h2 id="rotate-title">Trocar a senha de {item.data.title}</h2>
          </div>
          <button type="button" className="btn btn--ghost icon-btn" onClick={onClose} aria-label="Fechar">
            <Icon name="close" />
          </button>
        </div>

        {step === 1 && (
          <div className="stack">
            <p className="muted">Gere a nova senha. Alguns sites limitam tamanho ou símbolos; ajuste se for preciso.</p>
            <div className="secret-box">
              <code>{password}</code>
              <button type="button" className="btn btn--sm" onClick={() => regenerate()}>
                <Icon name="refresh" size={14} />
                Nova
              </button>
            </div>
            <span>
              <span className={`badge ${strengthBadge(strength)}`}>Força: {STRENGTH_LABELS[strength]}</span>
            </span>
            <label className="field">
              <span className="row-between">
                <span>Tamanho</span>
                <strong>{length}</strong>
              </span>
              <input
                type="range"
                min={12}
                max={policy.maxLength}
                value={length}
                onChange={(e) => {
                  setLength(Number(e.target.value));
                  regenerate({ length: Number(e.target.value) });
                }}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={symbols}
                onChange={(e) => {
                  setSymbols(e.target.checked);
                  regenerate({ symbols: e.target.checked });
                }}
              />
              Incluir símbolos
            </label>
            <div className="form__actions">
              <button type="button" className="btn btn--primary" onClick={() => setStep(2)}>
                Continuar
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="stack">
            <ol className="steps">
              <li>
                Abra a página de troca de senha do site
                {changeUrl ? (
                  <>
                    {' '}
                    (padrão <code>/.well-known/change-password</code>; se o site não suportar, ele abre a página inicial ou dá
                    erro, e aí procure "segurança" ou "senha" nas configurações da conta).
                    <div className="row">
                      <a className="btn btn--sm" href={changeUrl} target="_blank" rel="noopener noreferrer">
                        <Icon name="link" size={14} />
                        Abrir página de troca
                      </a>
                      {siteUrl && (
                        <a className="btn btn--sm btn--ghost" href={siteUrl} target="_blank" rel="noopener noreferrer">
                          Abrir site
                        </a>
                      )}
                    </div>
                  </>
                ) : (
                  <span className="subtle"> (este item não tem site salvo; acesse a conta manualmente).</span>
                )}
              </li>
              <li>
                Cole a senha atual e a nova quando o site pedir:
                <div className="row">
                  <button type="button" className="btn btn--sm" onClick={() => void copyField('current', item.data.password)}>
                    <Icon name={copied === 'current' ? 'check' : 'copy'} size={14} />
                    Copiar senha atual
                  </button>
                  <button type="button" className="btn btn--sm btn--primary" onClick={() => void copyField('new', password)}>
                    <Icon name={copied === 'new' ? 'check' : 'copy'} size={14} />
                    Copiar nova senha
                  </button>
                </div>
              </li>
              <li>Confirme a troca no site e volte aqui.</li>
            </ol>
            <p className="subtle">A área de transferência é limpa automaticamente após 30 segundos.</p>
            <div className="form__actions">
              <button type="button" className="btn btn--primary" onClick={() => setStep(3)}>
                Já troquei no site
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setStep(1)}>
                Voltar
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="stack">
            <div className="alert alert--warn">
              Confirme só se o site aceitou a nova senha. Se salvar sem ter trocado, o cofre ficará com uma senha que não
              funciona (a anterior continua no histórico, então dá para restaurar).
            </div>
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
                    await onSave(password);
                  } catch (err) {
                    setError(friendlyError(err, 'Não foi possível salvar a nova senha.'));
                    setBusy(false);
                  }
                }}
              >
                {busy ? 'Salvando…' : 'Sim, o site aceitou: salvar nova senha'}
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setStep(2)}>
                Ainda não
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
