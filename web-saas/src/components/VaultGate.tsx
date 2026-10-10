import { type FormEvent, useState } from 'react';
import { MASTER_PASSWORD_MIN_LENGTH, validateMasterPassword } from '../state/useVaultSession';

type VaultGateProps = {
  mode: 'needs-setup' | 'locked';
  email: string;
  onSetup: (masterPassword: string) => Promise<string>;
  onUnlock: (masterPassword: string) => Promise<void>;
  onRecover: (recoveryKey: string, newMasterPassword: string) => Promise<void>;
  onSignOut: () => void;
};

export function VaultGate({ mode, email, onSetup, onUnlock, onRecover, onSignOut }: VaultGateProps) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [recoveryKeyInput, setRecoveryKeyInput] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState('');
  const [savedConfirmed, setSavedConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Setup finished: the recovery key is shown exactly once.
  if (recoveryKey) {
    return (
      <section className="page-panel auth-box">
        <p className="eyebrow">Recovery key</p>
        <h3>Save your recovery key now</h3>
        <p className="notice warning">
          This key is shown only once and is not stored anywhere. If you forget your master password, it is the
          <strong> only way</strong> to recover your vault. Without it, your data cannot be recovered by anyone,
          including us.
        </p>
        <div className="password-output">
          <span>{recoveryKey}</span>
          <button type="button" onClick={() => navigator.clipboard?.writeText(recoveryKey)}>
            Copy
          </button>
        </div>
        <label className="check-row">
          <input type="checkbox" checked={savedConfirmed} onChange={(e) => setSavedConfirmed(e.target.checked)} />
          I stored my recovery key in a safe place
        </label>
        <div className="form-actions">
          <button
            type="button"
            className="primary-button"
            disabled={!savedConfirmed}
            onClick={() => setRecoveryKey('')}
          >
            Continue to my vault
          </button>
        </div>
      </section>
    );
  }

  const run = async (action: () => Promise<void>) => {
    setError('');
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      if (mode === 'needs-setup') {
        if (password !== confirm) throw new Error('Master passwords do not match.');
        setRecoveryKey(await onSetup(password));
        setSavedConfirmed(false);
      } else if (useRecovery) {
        const problem = validateMasterPassword(password);
        if (problem) throw new Error(problem);
        await onRecover(recoveryKeyInput, password);
      } else {
        await onUnlock(password);
      }
      setPassword('');
      setConfirm('');
      setRecoveryKeyInput('');
    });
  };

  const setup = mode === 'needs-setup';
  return (
    <section className="page-panel auth-box">
      <p className="eyebrow">{setup ? 'Create your vault' : 'Vault locked'}</p>
      <h3>{setup ? 'Choose a master password' : useRecovery ? 'Recover with recovery key' : 'Unlock your vault'}</h3>
      <p className="subheadline">Signed in as {email}</p>
      {setup && (
        <p className="notice warning">
          Your master password encrypts everything on this device before it is sent to the server. We cannot reset
          or recover it. Use at least {MASTER_PASSWORD_MIN_LENGTH} characters (a passphrase works well).
        </p>
      )}
      <form className="form-grid" onSubmit={submit}>
        {useRecovery && (
          <label>
            Recovery key
            <input
              value={recoveryKeyInput}
              onChange={(e) => setRecoveryKeyInput(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              required
            />
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
        {setup && (
          <label>
            Confirm master password
            <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </label>
        )}
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button type="submit" className="primary-button" disabled={busy}>
            {busy ? 'Working…' : setup ? 'Create vault' : useRecovery ? 'Recover vault' : 'Unlock'}
          </button>
          {!setup && (
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
