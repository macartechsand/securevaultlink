import { type FormEvent, useState } from 'react';
import { ACCOUNT_PASSWORD_MIN_LENGTH } from '../services/authService';

type AuthScreenProps = {
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>;
};

export function AuthScreen({ onSignIn, onSignUp }: AuthScreenProps) {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setInfo('');
    if (mode === 'sign-up' && form.password.length < ACCOUNT_PASSWORD_MIN_LENGTH) {
      setError(`Account password must have at least ${ACCOUNT_PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    setLoading(true);
    try {
      if (mode === 'sign-in') {
        await onSignIn(form.email, form.password);
      } else {
        const { needsConfirmation } = await onSignUp(form.email, form.password);
        if (needsConfirmation) {
          setInfo('Account created. Check your email to confirm it, then sign in.');
          setMode('sign-in');
        }
      }
      setForm((prev) => ({ ...prev, password: '' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to authenticate.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="page-panel auth-box">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Account</p>
          <h3>{mode === 'sign-in' ? 'Sign in' : 'Create your account'}</h3>
        </div>
      </div>
      <form className="form-grid" onSubmit={submit}>
        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            required
          />
        </label>
        <label>
          Account password
          <input
            type="password"
            autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
            value={form.password}
            onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
            required
          />
        </label>
        {mode === 'sign-up' && (
          <p className="notice">
            This password only signs you in. Next you will create a separate <strong>master password</strong> that
            encrypts your vault and never leaves your device.
          </p>
        )}
        {info && <div className="notice success">{info}</div>}
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button type="submit" className="primary-button" disabled={loading}>
            {mode === 'sign-in' ? 'Sign in' : 'Sign up'}
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() => setMode((m) => (m === 'sign-in' ? 'sign-up' : 'sign-in'))}
          >
            {mode === 'sign-in' ? 'Create account' : 'Already have an account?'}
          </button>
        </div>
      </form>
    </section>
  );
}
