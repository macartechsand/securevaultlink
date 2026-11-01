import { type FormEvent, useState } from 'react';
import { friendlyError } from '../lib/messages';
import { ACCOUNT_PASSWORD_MIN_LENGTH } from '../services/authService';
import { OAuthButtons } from './OAuthButtons';

type AuthScreenProps = {
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>;
  onResetPassword: (email: string) => Promise<void>;
  onResendConfirmation: (email: string) => Promise<void>;
  /** Error carried back from an OAuth provider, an expired link or the closed-beta check. */
  initialError?: string;
};

type Mode = 'sign-in' | 'sign-up' | 'reset' | 'confirm-sent';

const NO_EMAIL_HINT =
  'Se o e-mail não chegar em alguns minutos (verifique também o spam), peça ao administrador um link de acesso: ele consegue gerar e enviar por outro canal.';

export function AuthScreen({ onSignIn, onSignUp, onResetPassword, onResendConfirmation, initialError = '' }: AuthScreenProps) {
  const [mode, setMode] = useState<Mode>('sign-in');
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(() => (initialError ? friendlyError(initialError) : ''));
  const [info, setInfo] = useState('');

  const go = (next: Mode) => {
    setMode(next);
    setError('');
    setInfo('');
  };

  const run = async (fn: () => Promise<void>) => {
    setError('');
    setInfo('');
    setLoading(true);
    try {
      await fn();
    } catch (err) {
      setError(friendlyError(err, 'Não foi possível concluir.'));
    } finally {
      setLoading(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (mode === 'sign-up' && form.password.length < ACCOUNT_PASSWORD_MIN_LENGTH) {
      setError(`A senha da conta deve ter pelo menos ${ACCOUNT_PASSWORD_MIN_LENGTH} caracteres.`);
      return;
    }
    void run(async () => {
      if (mode === 'sign-in') {
        await onSignIn(form.email, form.password);
      } else if (mode === 'sign-up') {
        const { needsConfirmation } = await onSignUp(form.email, form.password);
        if (needsConfirmation) setMode('confirm-sent');
      } else if (mode === 'reset') {
        await onResetPassword(form.email);
        setInfo(`Se existir uma conta para ${form.email}, enviamos um link para redefinir a senha. ${NO_EMAIL_HINT}`);
      }
      setForm((prev) => ({ ...prev, password: '' }));
    });
  };

  if (mode === 'confirm-sent') {
    return (
      <>
        <div>
          <p className="eyebrow">Conta criada</p>
          <h2>Confirme seu e-mail</h2>
        </div>
        <div className="alert alert--ok">
          Enviamos um link de confirmação para <strong>{form.email}</strong>. Abra o link e depois entre aqui.
        </div>
        <p className="subtle">{NO_EMAIL_HINT}</p>
        {info && <div className="alert alert--ok">{info}</div>}
        {error && <div className="alert alert--error">{error}</div>}
        <button
          type="button"
          className="btn btn--block"
          disabled={loading}
          onClick={() =>
            void run(async () => {
              await onResendConfirmation(form.email);
              setInfo('Link reenviado.');
            })
          }
        >
          Reenviar e-mail de confirmação
        </button>
        <button type="button" className="btn btn--primary btn--block" onClick={() => go('sign-in')}>
          Já confirmei: entrar
        </button>
      </>
    );
  }

  const titles: Record<Exclude<Mode, 'confirm-sent'>, string> = {
    'sign-in': 'Entrar',
    'sign-up': 'Criar conta',
    reset: 'Redefinir a senha da conta',
  };
  return (
    <>
      <div>
        <p className="eyebrow">Conta</p>
        <h2>{titles[mode]}</h2>
      </div>
      {mode !== 'reset' && <OAuthButtons />}
      <form className="form" onSubmit={submit}>
        <label className="field">
          E-mail
          <input type="email" autoComplete="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} required />
        </label>
        {mode !== 'reset' && (
          <label className="field">
            Senha da conta
            <input
              type="password"
              autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
              value={form.password}
              onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
              required
            />
          </label>
        )}
        {mode === 'sign-up' && (
          <div className="alert alert--info">
            O cadastro está restrito a convidados. Esta senha serve só para entrar; depois você cria uma{' '}
            <strong>senha mestra</strong> separada, que criptografa o cofre e nunca sai do seu dispositivo.
          </div>
        )}
        {mode === 'reset' && (
          <div className="alert">
            Isto redefine só a senha de <strong>entrada</strong>. A senha mestra do cofre não pode ser redefinida por e-mail; use
            a chave de recuperação, se você a ativou.
          </div>
        )}
        {info && <div className="alert alert--ok">{info}</div>}
        {error && <div className="alert alert--error">{error}</div>}
        <button type="submit" className="btn btn--primary btn--block" disabled={loading}>
          {loading ? 'Aguarde…' : mode === 'sign-in' ? 'Entrar' : mode === 'sign-up' ? 'Criar conta' : 'Enviar link de redefinição'}
        </button>
        {mode === 'sign-in' && (
          <>
            <button type="button" className="btn btn--ghost btn--block" onClick={() => go('reset')}>
              Esqueci a senha da conta
            </button>
            <button type="button" className="btn btn--ghost btn--block" onClick={() => go('sign-up')}>
              Recebeu um convite? Criar conta
            </button>
          </>
        )}
        {mode !== 'sign-in' && (
          <button type="button" className="btn btn--ghost btn--block" onClick={() => go('sign-in')}>
            Voltar para entrar
          </button>
        )}
      </form>
    </>
  );
}
