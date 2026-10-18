import { type FormEvent, useState } from 'react';

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
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Recovery</p>
          <h3>Recovery key</h3>
        </div>
        <span className={`status-pill ${enabled ? 'healthy' : 'review'}`}>{enabled ? 'On' : 'Off'}</span>
      </div>

      {recoveryKey ? (
        <>
          <p className="notice warning">
            Save this key now. It is shown only once and is not stored anywhere. With it you can set a new master password
            if you forget yours. Anyone who has it (and access to your account) can open your vault.
          </p>
          <div className="password-output">
            <span>{recoveryKey}</span>
            <button type="button" onClick={() => navigator.clipboard?.writeText(recoveryKey)}>
              Copy
            </button>
          </div>
          <label className="check-row">
            <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />I stored my recovery key
            in a safe place (offline or in another password manager)
          </label>
          <button type="button" className="primary-button" disabled={!saved} onClick={() => setRecoveryKey('')}>
            Done
          </button>
        </>
      ) : mode === 'idle' ? (
        <>
          <p>
            {enabled
              ? 'Your vault can be recovered with your recovery key if you forget the master password.'
              : 'Without a recovery key, a forgotten master password means your vault is lost permanently.'}
          </p>
          <div className="form-actions">
            <button type="button" className="primary-button" onClick={() => setMode('enable')}>
              {enabled ? 'Generate a new key' : 'Turn on recovery key'}
            </button>
            {enabled && (
              <button type="button" className="ghost-button" onClick={() => setMode('disable')}>
                Turn off
              </button>
            )}
          </div>
          {enabled && <p className="subheadline">Generating a new key invalidates the previous one.</p>}
        </>
      ) : (
        <form className="form-grid" onSubmit={submit}>
          <label>
            Confirm with your master password
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <div className="form-actions">
            <button type="submit" className="primary-button" disabled={busy}>
              {busy ? 'Working…' : mode === 'enable' ? 'Create recovery key' : 'Turn off recovery'}
            </button>
            <button type="button" className="ghost-button" onClick={() => setMode('idle')}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {error && <div className="form-error">{error}</div>}
    </div>
  );
}
