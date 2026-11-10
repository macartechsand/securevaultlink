import { type FormEvent, useState } from 'react';
import { friendlyError } from '../lib/messages';
import { looksLikeEmail, readRememberedEmail, rememberEmail } from '../lib/rememberedEmail';
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

/**
 * Sign-in modelled on Bitwarden's: the e-mail first ("Continuar", optional "Lembrar e-mail"), then the
 * ways to sign in with that address (account password, Google/GitHub), with the address shown and
 * changeable ("Não é você?"), and a help panel when the password is refused.
 */
type Mode = 'email' | 'password' | 'sign-up' | 'reset' | 'confirm-sent';

const NO_EMAIL_HINT =
  'Se o e-mail não chegar em alguns minutos (verifique também o spam), peça ao administrador um link de acesso: ele consegue gerar e enviar por outro canal.';

export function AuthScreen({ onSignIn, onSignUp, onResetPassword, onResendConfirmation, initialError = '' }: AuthScreenProps) {
  const [remembered] = useState(readRememberedEmail);
  const [mode, setMode] = useState<Mode>('email');
  const [email, setEmail] = useState(remembered);
  const [remember, setRemember] = useState(Boolean(remembered));
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(() => (initialError ? friendlyError(initialError) : ''));
  const [failedSignIn, setFailedSignIn] = useState(false);
  const [info, setInfo] = useState('');

  const go = (next: Mode) => {
    setMode(next);
    setError('');
    setInfo('');
    setFailedSignIn(false);
    setPassword('');
    setShowPassword(false);
  };

  const run = async (fn: () => Promise<void>) => {
    setError('');
    setInfo('');
    setLoading(true);
    try {
      await fn();
    } catch (err) {
      setError(friendlyError(err, 'Não foi possível concluir.'));
      if (mode === 'password' && err instanceof Error && err.message === 'Invalid login credentials') setFailedSignIn(true);
    } finally {
      setLoading(false);
    }
  };

  const continueWithEmail = (event: FormEvent) => {
    event.preventDefault();
    if (!looksLikeEmail(email)) return setError('Digite um e-mail válido.');
    rememberEmail(email, remember);
    go('password');
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (mode === 'sign-up' && password.length < ACCOUNT_PASSWORD_MIN_LENGTH) {
      setError(`A senha da conta deve ter pelo menos ${ACCOUNT_PASSWORD_MIN_LENGTH} caracteres.`);
      return;
    }
    void run(async () => {
      const address = email.trim();
      if (mode === 'password') {
        await onSignIn(address, password);
      } else if (mode === 'sign-up') {
        const { needsConfirmation } = await onSignUp(address, password);
        if (needsConfirmation) setMode('confirm-sent');
      } else if (mode === 'reset') {
        await onResetPassword(address);
        setInfo(`Se existir uma conta para ${address}, enviamos um link para redefinir a senha. ${NO_EMAIL_HINT}`);
      }
      setPassword('');
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
          Enviamos um link de confirmação para <strong>{email}</strong>. Abra o link e depois entre aqui.
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
              await onResendConfirmation(email.trim());
              setInfo('Link reenviado.');
            })
          }
        >
          Reenviar e-mail de confirmação
        </button>
        <button type="button" className="btn btn--primary btn--block" onClick={() => go('password')}>
          Já confirmei: entrar
        </button>
      </>
    );
  }

  if (mode === 'email') {
    return (
      <>
        <div>
          <p className="eyebrow">Conta</p>
          <h2>Entrar no SecureVault</h2>
        </div>
        <form className="form" onSubmit={continueWithEmail}>
          <label className="field">
            E-mail
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
          </label>
          <label className="check">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Lembrar e-mail neste dispositivo
          </label>
          {error && <div className="alert alert--error">{error}</div>}
          <button type="submit" className="btn btn--primary btn--block">
            Continuar
          </button>
        </form>
        <OAuthButtons dividerLabel="ou" placement="after" />
        <p className="subtle auth-footer">
          Recebeu um convite por e-mail sem link?{' '}
          <button type="button" className="link-button" onClick={() => go('sign-up')}>
            Criar conta
          </button>
        </p>
      </>
    );
  }

  const titles: Record<'password' | 'sign-up' | 'reset', string> = {
    password: 'Entrar',
    'sign-up': 'Criar conta',
    reset: 'Redefinir a senha da conta',
  };
  return (
    <>
      <div>
        <p className="eyebrow">Conta</p>
        <h2>{titles[mode]}</h2>
      </div>
      {mode === 'password' && (
        <div className="account-chip">
          <span className="account-chip__email">{email}</span>
          <button type="button" className="link-button" onClick={() => go('email')}>
            Não é você?
          </button>
        </div>
      )}
      <form className="form" onSubmit={submit}>
        {mode !== 'password' && (
          <label className="field">
            E-mail
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
        )}
        {mode === 'password' && <input type="email" autoComplete="username" value={email} readOnly hidden />}
        {mode !== 'reset' && (
          <label className="field">
            Senha da conta
            <span className="input-with-action">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete={mode === 'password' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus={mode === 'password'}
                required
              />
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShowPassword((v) => !v)} aria-pressed={showPassword}>
                {showPassword ? 'Ocultar' : 'Mostrar'}
              </button>
            </span>
            {mode === 'password' && <span className="subtle">A senha de entrar. A senha mestra do cofre é pedida em seguida.</span>}
          </label>
        )}
        {mode === 'sign-up' && (
          <div className="alert alert--info">
            O cadastro está restrito a convidados. Esta senha serve só para entrar; depois você cria uma{' '}
            <strong>senha mestra</strong> separada, que criptografa o cofre e nunca sai do seu dispositivo. Se o administrador
            mandou um <strong>link de convite</strong>, abra o link em vez de usar este formulário.
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
        {failedSignIn && (
          <div className="alert alert--info">
            <strong>Não consegue entrar?</strong>
            <ul className="tight-list">
              <li>
                Aqui vai a senha da <strong>conta</strong> (a que você definiu ao abrir o convite), não a senha mestra.
              </li>
              <li>Se você entrou antes com Google ou GitHub, use o botão abaixo com o mesmo e-mail.</li>
              <li>Se abriu o convite mas não salvou a senha, use "Esqueci a senha da conta" ou peça ao administrador um link de redefinição.</li>
            </ul>
          </div>
        )}
        <button type="submit" className="btn btn--primary btn--block" disabled={loading}>
          {loading ? 'Aguarde…' : mode === 'password' ? 'Entrar com a senha da conta' : mode === 'sign-up' ? 'Criar conta' : 'Enviar link de redefinição'}
        </button>
        {mode === 'password' && (
          <button type="button" className="btn btn--ghost btn--block" onClick={() => go('reset')}>
            Esqueci a senha da conta
          </button>
        )}
        {mode !== 'password' && (
          <button type="button" className="btn btn--ghost btn--block" onClick={() => go(looksLikeEmail(email) ? 'password' : 'email')}>
            Voltar para entrar
          </button>
        )}
      </form>
      {mode === 'password' && <OAuthButtons dividerLabel="ou entre com" placement="after" />}
    </>
  );
}
