import { type FormEvent, useState } from 'react';
import { friendlyError } from '../lib/messages';
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
      setError(`A senha da conta deve ter pelo menos ${ACCOUNT_PASSWORD_MIN_LENGTH} caracteres.`);
      return;
    }
    setLoading(true);
    try {
      if (mode === 'sign-in') {
        await onSignIn(form.email, form.password);
      } else {
        const { needsConfirmation } = await onSignUp(form.email, form.password);
        if (needsConfirmation) {
          setInfo('Conta criada. Confirme pelo link enviado ao seu e-mail e depois entre.');
          setMode('sign-in');
        }
      }
      setForm((prev) => ({ ...prev, password: '' }));
    } catch (err) {
      setError(friendlyError(err, 'Não foi possível entrar.'));
    } finally {
      setLoading(false);
    }
  };

  const signIn = mode === 'sign-in';
  return (
    <>
      <div>
        <p className="eyebrow">Conta</p>
        <h2>{signIn ? 'Entrar' : 'Criar conta'}</h2>
      </div>
      <form className="form" onSubmit={submit}>
        <label className="field">
          E-mail
          <input
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            required
          />
        </label>
        <label className="field">
          Senha da conta
          <input
            type="password"
            autoComplete={signIn ? 'current-password' : 'new-password'}
            value={form.password}
            onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
            required
          />
        </label>
        {!signIn && (
          <div className="alert alert--info">
            Esta senha serve só para entrar. Em seguida você vai criar uma <strong>senha mestra</strong> separada, que
            criptografa o cofre e nunca sai do seu dispositivo.
          </div>
        )}
        {info && <div className="alert alert--ok">{info}</div>}
        {error && <div className="alert alert--error">{error}</div>}
        <button type="submit" className="btn btn--primary btn--block" disabled={loading}>
          {loading ? 'Aguarde…' : signIn ? 'Entrar' : 'Criar conta'}
        </button>
        <button type="button" className="btn btn--ghost btn--block" onClick={() => setMode(signIn ? 'sign-up' : 'sign-in')}>
          {signIn ? 'Não tem conta? Criar conta' : 'Já tem conta? Entrar'}
        </button>
      </form>
    </>
  );
}
