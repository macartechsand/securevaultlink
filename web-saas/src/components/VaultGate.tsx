import { type FormEvent, useState } from 'react';
import { friendlyError } from '../lib/messages';
import { MASTER_PASSWORD_MIN_LENGTH, validateMasterPassword } from '../state/useVaultSession';

type VaultGateProps = {
  mode: 'needs-setup' | 'locked';
  email: string;
  onSetup: (masterPassword: string) => Promise<void>;
  onUnlock: (masterPassword: string) => Promise<void>;
  hasRecovery: boolean;
  onRecover: (recoveryKey: string, newMasterPassword: string) => Promise<void>;
  onSignOut: () => void;
};

export function VaultGate({ mode, email, onSetup, onUnlock, hasRecovery, onRecover, onSignOut }: VaultGateProps) {
  const [password, setPassword] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState('');
  const [confirm, setConfirm] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const setup = mode === 'needs-setup';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (setup) {
        if (password !== confirm) throw new Error('Master passwords do not match.');
        await onSetup(password);
      } else if (useRecovery) {
        const problem = validateMasterPassword(password);
        if (problem) throw new Error(problem);
        if (password !== confirm) throw new Error('Master passwords do not match.');
        await onRecover(recoveryKey, password);
      } else {
        await onUnlock(password);
      }
      setPassword('');
      setConfirm('');
      setRecoveryKey('');
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const title = setup ? 'Crie sua senha mestra' : useRecovery ? 'Recuperar com a chave de recuperação' : 'Desbloquear o cofre';
  return (
    <>
      <div>
        <p className="eyebrow">{setup ? 'Novo cofre' : 'Cofre bloqueado'}</p>
        <h2>{title}</h2>
        <p className="subtle">Conectado como {email}</p>
      </div>
      {setup && (
        <div className="alert alert--warn">
          A senha mestra criptografa tudo neste dispositivo antes de enviar ao servidor. Ela nunca é armazenada nem
          enviada, então <strong>ninguém consegue redefini-la para você</strong>. Depois de criar o cofre, você pode
          ativar uma chave de recuperação opcional em Configurações; sem ela, esquecer a senha mestra significa perder o
          cofre. Use pelo menos {MASTER_PASSWORD_MIN_LENGTH} caracteres (uma frase longa funciona bem).
        </div>
      )}
      <form className="form" onSubmit={submit}>
        {useRecovery && (
          <label className="field">
            Chave de recuperação
            <input value={recoveryKey} onChange={(e) => setRecoveryKey(e.target.value)} autoComplete="off" spellCheck={false} required />
          </label>
        )}
        <label className="field">
          {useRecovery ? 'Nova senha mestra' : 'Senha mestra'}
          <input
            type="password"
            autoComplete={setup || useRecovery ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            required
          />
        </label>
        {(setup || useRecovery) && (
          <label className="field">
            Confirme a {useRecovery ? 'nova ' : ''}senha mestra
            <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </label>
        )}
        {setup && (
          <label className="check">
            <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
            Entendo que, sem chave de recuperação, uma senha mestra esquecida não pode ser recuperada.
          </label>
        )}
        {error && <div className="alert alert--error">{error}</div>}
        <button type="submit" className="btn btn--primary btn--block" disabled={busy || (setup && !understood)}>
          {busy ? 'Processando…' : setup ? 'Criar cofre' : useRecovery ? 'Recuperar cofre' : 'Desbloquear'}
        </button>
        {!setup && hasRecovery && (
          <button type="button" className="btn btn--ghost btn--block" onClick={() => setUseRecovery((v) => !v)}>
            {useRecovery ? 'Usar a senha mestra' : 'Esqueci a senha mestra'}
          </button>
        )}
        <button type="button" className="btn btn--ghost btn--block" onClick={onSignOut}>
          Sair
        </button>
      </form>
    </>
  );
}
