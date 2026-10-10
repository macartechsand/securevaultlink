import { type FormEvent, useState } from 'react';

type MfaChallengeProps = {
  email: string;
  onVerify: (code: string) => Promise<void>;
  onSignOut: () => void;
};

export function MfaChallenge({ email, onVerify, onSignOut }: MfaChallengeProps) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await onVerify(code);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="page-panel auth-box">
      <p className="eyebrow">Two-factor authentication</p>
      <h3>Enter your authenticator code</h3>
      <p className="subheadline">Signed in as {email}</p>
      <form className="form-grid" onSubmit={submit}>
        <label>
          6-digit code
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]{6,7}"
            maxLength={7}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
            required
          />
        </label>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button type="submit" className="primary-button" disabled={busy}>
            {busy ? 'Verifying…' : 'Verify'}
          </button>
          <button type="button" className="ghost-button" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </form>
      <p className="notice">Lost your authenticator? Contact support: an administrator must remove the factor from your account.</p>
    </section>
  );
}
