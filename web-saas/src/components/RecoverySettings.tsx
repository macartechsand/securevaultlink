import { type FormEvent, useState } from 'react';
import { friendlyError } from '../lib/messages';

type RecoverySettingsProps = {
  enabled: boolean;
  onEnable: (masterPassword: string) => Promise<string>;
  onDisable: (masterPassword: string) => Promise<void>;
};

/** Opt-in recovery key: shown once, can be regenerated (invalidating the previous one) or turned off. */
export function RecoverySettings({ enabled, onEnable, onDisable }: RecoverySettingsProps) {
  const [mode, setMode] = useState<'idle' | 'enable' | 'disable'>('idle');
  const [password, setPassword] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'enable') {
        setRecoveryKey(await onEnable(password));
        setSaved(false);
      } else {
        await onDisable(password);
      }
      setMode('idle');
      setPassword('');
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <div className="card__header">
        <div>
          <p className="eyebrow">Recuperação</p>
          <h2>Chave de recuperação</h2>
        </div>
        <span className={`badge ${enabled ? 'badge--ok' : 'badge--warn'}`}>{enabled ? 'Ativada' : 'Desativada'}</span>
      </div>

      {recoveryKey ? (
        <>
          <div className="alert alert--warn">
            Guarde esta chave agora. Ela aparece só uma vez e não fica armazenada em lugar nenhum. Com ela você define uma
            nova senha mestra se esquecer a atual. Quem tiver a chave (e acesso à sua conta) consegue abrir o cofre.
          </div>
          <div className="secret-box">
            <code>{recoveryKey}</code>
            <button type="button" className="btn btn--sm" onClick={() => navigator.clipboard?.writeText(recoveryKey)}>
              Copiar
            </button>
          </div>
          <label className="check">
            <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
            Guardei a chave de recuperação em um lugar seguro (offline ou em outro gerenciador de senhas)
          </label>
          <div>
            <button type="button" className="btn btn--primary" disabled={!saved} onClick={() => setRecoveryKey('')}>
              Concluir
            </button>
          </div>
        </>
      ) : mode === 'idle' ? (
        <>
          <p className="muted">
            {enabled
              ? 'Se esquecer a senha mestra, você recupera o cofre com a chave de recuperação.'
              : 'Sem chave de recuperação, uma senha mestra esquecida significa perder o cofre para sempre.'}
          </p>
          <div className="form__actions">
            <button type="button" className="btn btn--primary" onClick={() => setMode('enable')}>
              {enabled ? 'Gerar nova chave' : 'Ativar chave de recuperação'}
            </button>
            {enabled && (
              <button type="button" className="btn btn--danger" onClick={() => setMode('disable')}>
                Desativar
              </button>
            )}
          </div>
          {enabled && <p className="subtle">Gerar uma nova chave invalida a anterior.</p>}
        </>
      ) : (
        <form className="form" onSubmit={submit}>
          <label className="field">
            Confirme com sua senha mestra
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <div className="form__actions">
            <button type="submit" className="btn btn--primary" disabled={busy}>
              {busy ? 'Processando…' : mode === 'enable' ? 'Criar chave de recuperação' : 'Desativar recuperação'}
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setMode('idle')}>
              Cancelar
            </button>
          </div>
        </form>
      )}
      {error && <div className="alert alert--error">{error}</div>}
    </section>
  );
}
