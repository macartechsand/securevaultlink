import { type FormEvent, useState } from 'react';

type SettingsProps = {
  email: string;
  idleMinutes: number;
  onChangePassword: (current: string, next: string) => Promise<void>;
  onLock: () => void;
};

export function Settings({ email, idleMinutes, onChangePassword, onLock }: SettingsProps) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setDone(false);
    setBusy(true);
    try {
      await onChangePassword(current, next);
      setCurrent('');
      setNext('');
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to change the master password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-grid">
      <div className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Session</p>
            <h3>Vault lock</h3>
          </div>
        </div>
        <p>Signed in as {email}.</p>
        <p>The vault locks automatically after {idleMinutes} minutes of inactivity. Decrypted data is kept in memory only.</p>
        <button type="button" className="ghost-button" onClick={onLock}>
          Lock now
        </button>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Encryption</p>
            <h3>Change master password</h3>
          </div>
        </div>
        <form className="form-grid" onSubmit={submit}>
          <label>
            Current master password
            <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          </label>
          <label>
            New master password
            <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required />
          </label>
          {done && <div className="notice success">Master password changed. Your entries remain intact.</div>}
          {error && <div className="form-error">{error}</div>}
          <div className="form-actions">
            <button type="submit" className="primary-button" disabled={busy}>
              {busy ? 'Working…' : 'Change password'}
            </button>
          </div>
        </form>
        <p className="notice warning">
          If you lose both your master password and your recovery key, your vault cannot be recovered.
        </p>
      </div>
    </div>
  );
}
