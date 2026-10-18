import { type FormEvent, useState } from 'react';
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
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="page-panel auth-box">
      <p className="eyebrow">{setup ? 'Create your vault' : 'Vault locked'}</p>
      <h3>{setup ? 'Choose a master password' : useRecovery ? 'Recover with your recovery key' : 'Unlock your vault'}</h3>
      <p className="subheadline">Signed in as {email}</p>
      {setup && (
        <p className="notice warning">
          Your master password encrypts everything on this device before it is sent to the server. It is never
          stored or sent anywhere, so <strong>nobody can reset it for you</strong>. After creating the vault you can turn
          on an optional recovery key in Settings; without it, a forgotten master password means the vault is lost. Use
          at least {MASTER_PASSWORD_MIN_LENGTH} characters (a passphrase works well).
        </p>
      )}
      <form className="form-grid" onSubmit={submit}>
        {useRecovery && (
          <label>
            Recovery key
            <input value={recoveryKey} onChange={(e) => setRecoveryKey(e.target.value)} autoComplete="off" spellCheck={false} required />
          </label>
        )}
        <label>
          {useRecovery ? 'New master password' : 'Master password'}
          <input
            type="password"
            autoComplete={setup || useRecovery ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {useRecovery && (
          <label>
            Confirm new master password
            <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </label>
        )}
        {setup && (
          <>
            <label>
              Confirm master password
              <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            </label>
            <label className="check-row">
              <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
              I understand that without a recovery key a forgotten master password cannot be recovered
            </label>
          </>
        )}
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button type="submit" className="primary-button" disabled={busy || (setup && !understood)}>
            {busy ? 'Working…' : setup ? 'Create vault' : useRecovery ? 'Recover vault' : 'Unlock'}
          </button>
          {!setup && hasRecovery && (
            <button type="button" className="ghost-button" onClick={() => setUseRecovery((v) => !v)}>
              {useRecovery ? 'Use master password' : 'Forgot master password?'}
            </button>
          )}
          <button type="button" className="ghost-button" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </form>
    </section>
  );
}
