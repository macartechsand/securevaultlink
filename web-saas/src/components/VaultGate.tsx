import { type FormEvent, useState } from 'react';
import { MASTER_PASSWORD_MIN_LENGTH } from '../state/useVaultSession';

type VaultGateProps = {
  mode: 'needs-setup' | 'locked';
  email: string;
  onSetup: (masterPassword: string) => Promise<void>;
  onUnlock: (masterPassword: string) => Promise<void>;
  onSignOut: () => void;
};

export function VaultGate({ mode, email, onSetup, onUnlock, onSignOut }: VaultGateProps) {
  const [password, setPassword] = useState('');
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
      } else {
        await onUnlock(password);
      }
      setPassword('');
      setConfirm('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="page-panel auth-box">
      <p className="eyebrow">{setup ? 'Create your vault' : 'Vault locked'}</p>
      <h3>{setup ? 'Choose a master password' : 'Unlock your vault'}</h3>
      <p className="subheadline">Signed in as {email}</p>
      {setup && (
        <p className="notice warning">
          Your master password encrypts everything on this device before it is sent to the server. It is never
          stored or sent anywhere, so <strong>nobody can reset or recover it</strong>. If you forget it, your vault is
          lost permanently. Use at least {MASTER_PASSWORD_MIN_LENGTH} characters (a passphrase works well).
        </p>
      )}
      <form className="form-grid" onSubmit={submit}>
        <label>
          Master password
          <input
            type="password"
            autoComplete={setup ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {setup && (
          <>
            <label>
              Confirm master password
              <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            </label>
            <label className="check-row">
              <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
              I understand that a forgotten master password cannot be recovered
            </label>
          </>
        )}
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button type="submit" className="primary-button" disabled={busy || (setup && !understood)}>
            {busy ? 'Working…' : setup ? 'Create vault' : 'Unlock'}
          </button>
          <button type="button" className="ghost-button" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </form>
    </section>
  );
}
