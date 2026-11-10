import type { UserIdentity } from '@supabase/supabase-js';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { friendlyError } from '../lib/messages';
import {
  ACCOUNT_PASSWORD_MIN_LENGTH,
  OAUTH_PROVIDERS,
  type OAuthProvider,
  fetchEnabledProviders,
  linkProvider,
  listIdentities,
  unlinkProvider,
} from '../services/authService';
import { ProviderIcon } from './ui/ProviderIcon';

/**
 * "Formas de entrar": the ways into the ACCOUNT (never the vault). Like Bitwarden's linked logins:
 * e-mail and password plus Google/GitHub on the same account, so one person never ends up with two
 * accounts. Linking needs the provider to confirm an e-mail; the vault still needs the master password.
 */
export function LoginMethodsCard({ onSetAccountPassword }: { onSetAccountPassword: (password: string) => Promise<void> }) {
  const [identities, setIdentities] = useState<UserIdentity[] | null>(null);
  const [enabled, setEnabled] = useState<OAuthProvider[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [password, setPassword] = useState('');
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    try {
      setIdentities(await listIdentities());
    } catch (err) {
      setError(friendlyError(err, 'Não foi possível carregar as formas de entrar.'));
    }
  }, []);

  useEffect(() => {
    void load();
    void fetchEnabledProviders().then(setEnabled);
  }, [load]);

  const hasEmail = identities?.some((i) => i.provider === 'email') ?? false;
  const linked = (provider: string) => identities?.find((i) => i.provider === provider);

  const link = async (provider: OAuthProvider) => {
    setError('');
    setInfo('');
    setBusy(provider);
    const { error: err } = await linkProvider(provider);
    if (err) {
      setError(friendlyError(err, 'Não foi possível conectar.'));
      setBusy('');
    }
  };

  const unlink = async (identity: UserIdentity, name: string) => {
    if (!window.confirm(`Desconectar ${name}? Você deixa de poder entrar com essa conta.`)) return;
    setError('');
    setInfo('');
    setBusy(identity.provider);
    try {
      await unlinkProvider(identity);
      setInfo(`${name} desconectado.`);
      await load();
    } catch (err) {
      setError(friendlyError(err, 'Não foi possível desconectar.'));
    } finally {
      setBusy('');
    }
  };

  const savePassword = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (password.length < ACCOUNT_PASSWORD_MIN_LENGTH) return setError(`Use pelo menos ${ACCOUNT_PASSWORD_MIN_LENGTH} caracteres.`);
    setBusy('password');
    try {
      await onSetAccountPassword(password);
      setPassword('');
      setShowForm(false);
      setInfo('Senha da conta salva. Agora você também entra com e-mail e senha (por exemplo, no app Android).');
      await load();
    } catch (err) {
      setError(friendlyError(err, 'Não foi possível salvar a senha.'));
    } finally {
      setBusy('');
    }
  };

  const count = identities?.length ?? 0;
  return (
    <section className="card">
      <div className="card__header">
        <div>
          <p className="eyebrow">Conta</p>
          <h2>Formas de entrar</h2>
          <p className="subtle">
            Ligue Google ou GitHub à mesma conta para entrar de qualquer jeito. Isto vale só para a conta: o cofre continua
            pedindo a senha mestra.
          </p>
        </div>
      </div>
      {identities === null && !error && <p className="muted">Carregando…</p>}
      {identities !== null && (
        <div>
          <div className="identity-row">
            <span>
              <strong>E-mail e senha</strong>
              <br />
              <span className="subtle">{hasEmail ? 'Ativo' : 'Sem senha da conta: defina uma para entrar com e-mail no app'}</span>
            </span>
            <button type="button" className="btn btn--sm" onClick={() => setShowForm((v) => !v)} disabled={busy !== ''}>
              {hasEmail ? 'Trocar senha' : 'Definir senha'}
            </button>
          </div>
          {showForm && (
            <form className="form" onSubmit={savePassword}>
              <label className="field">
                Nova senha da conta (a de entrar)
                <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </label>
              <button type="submit" className="btn btn--primary btn--sm" disabled={busy !== ''}>
                {busy === 'password' ? 'Salvando…' : 'Salvar senha da conta'}
              </button>
            </form>
          )}
          {OAUTH_PROVIDERS.map((p) => {
            const identity = linked(p.key);
            const available = enabled.includes(p.key);
            if (!identity && !available) return null;
            const email = identity?.identity_data?.email as string | undefined;
            return (
              <div className="identity-row" key={p.key}>
                <span className="row">
                  <ProviderIcon provider={p.key} />
                  <span>
                    <strong>{p.name}</strong>
                    <br />
                    <span className="subtle">{identity ? `Conectado${email ? ` (${email})` : ''}` : 'Não conectado'}</span>
                  </span>
                </span>
                {identity ? (
                  <button type="button" className="btn btn--ghost btn--sm" disabled={busy !== '' || count < 2} onClick={() => void unlink(identity, p.name)}>
                    Desconectar
                  </button>
                ) : (
                  <button type="button" className="btn btn--sm" disabled={busy !== ''} onClick={() => void link(p.key)}>
                    {busy === p.key ? 'Redirecionando…' : 'Conectar'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {count === 1 && <p className="subtle">A última forma de entrar não pode ser desconectada.</p>}
      {info && <div className="alert alert--ok">{info}</div>}
      {error && <div className="alert alert--error">{error}</div>}
    </section>
  );
}
