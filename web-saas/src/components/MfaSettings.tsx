import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { enrollTotp, listVerifiedTotpFactors, type TotpFactor, unenrollTotp, verifyTotp } from '../services/mfaService';

export function MfaSettings() {
  const [factors, setFactors] = useState<TotpFactor[] | null>(null);
  const [enrollment, setEnrollment] = useState<{ factorId: string; qrCode: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const refresh = useCallback(async () => {
    try {
      setFactors((await listVerifiedTotpFactors()).filter((f) => f.status === 'verified'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load MFA status.');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (action: () => Promise<void>) => {
    setError('');
    setInfo('');
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const confirmEnrollment = (event: FormEvent) => {
    event.preventDefault();
    if (!enrollment) return;
    void run(async () => {
      await verifyTotp(enrollment.factorId, code);
      setEnrollment(null);
      setCode('');
      setInfo('Two-factor authentication is on. You will need a code from your authenticator at every sign-in.');
      await refresh();
    });
  };

  const enabled = (factors?.length ?? 0) > 0;

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Account security</p>
          <h3>Two-factor authentication</h3>
        </div>
        {factors && <span className={`status-pill ${enabled ? 'healthy' : 'review'}`}>{enabled ? 'On' : 'Off'}</span>}
      </div>

      {!enabled && !enrollment && (
        <>
          <p>Protect your account with a 6-digit code from an authenticator app (Google Authenticator, Authy, 1Password…).</p>
          <button type="button" className="primary-button" disabled={busy || !factors} onClick={() => void run(async () => setEnrollment(await enrollTotp()))}>
            Enable two-factor authentication
          </button>
        </>
      )}

      {enrollment && (
        <form className="form-grid" onSubmit={confirmEnrollment}>
          <p>1. Scan this QR code with your authenticator app.</p>
          <img className="mfa-qr" src={enrollment.qrCode} alt="QR code for authenticator app" width={180} height={180} />
          <p>
            Or enter this key manually: <code>{enrollment.secret}</code>
          </p>
          <label>
            2. Enter the 6-digit code shown in the app
            <input inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} required />
          </label>
          <div className="form-actions">
            <button type="submit" className="primary-button" disabled={busy}>
              {busy ? 'Verifying…' : 'Confirm'}
            </button>
            <button type="button" className="ghost-button" onClick={() => setEnrollment(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {enabled && (
        <>
          <p>Every sign-in requires a code from your authenticator. Your vault data cannot be read without it.</p>
          <button
            type="button"
            className="ghost-button"
            disabled={busy}
            onClick={() => {
              if (!window.confirm('Turn off two-factor authentication?')) return;
              void run(async () => {
                for (const f of factors ?? []) await unenrollTotp(f.id);
                setInfo('Two-factor authentication is off.');
                await refresh();
              });
            }}
          >
            Turn off
          </button>
        </>
      )}

      {info && <div className="notice success">{info}</div>}
      {error && <div className="form-error">{error}</div>}
      <p className="notice">
        Keep access to your authenticator. If you lose it, an administrator must remove the factor before you can
        sign in again.
      </p>
    </div>
  );
}
