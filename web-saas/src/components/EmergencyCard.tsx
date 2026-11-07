import { type FormEvent, useState } from 'react';
import { ACCOUNT_PASSWORD_MIN_LENGTH } from '../services/authService';
import { friendlyError } from '../lib/messages';

type EmergencyCardProps = {
  premium: boolean;
  onEmergency: () => Promise<void>;
  onChangeAccountPassword: (password: string) => Promise<void>;
};

/** Premium "modo emergência": one click ends every other session and removes every PIN. */
export function EmergencyCard({ premium, onEmergency, onChangeAccountPassword }: EmergencyCardProps) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [passwordDone, setPasswordDone] = useState(false);

  const activate = async () => {
    if (!window.confirm('Ativar o modo emergência? Todas as outras sessões serão encerradas e o PIN será removido de todos os aparelhos.')) return;
    setError('');
    setBusy(true);
    try {
      await onEmergency();
      setDone(true);
    } catch (err) {
      setError(friendlyError(err, 'Não foi possível concluir o modo emergência.'));
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (password.length < ACCOUNT_PASSWORD_MIN_LENGTH) return setError(`Use pelo menos ${ACCOUNT_PASSWORD_MIN_LENGTH} caracteres.`);
    setBusy(true);
    try {
      await onChangeAccountPassword(password);
      setPassword('');
      setPasswordDone(true);
    } catch (err) {
      setError(friendlyError(err, 'Não foi possível trocar a senha da conta.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card card--danger">
      <div className="card__header">
        <div>
          <p className="eyebrow">Emergência</p>
          <h2>Acho que invadiram minha conta</h2>
        </div>
        {!premium && <span className="badge badge--info">Premium</span>}
      </div>
      {!premium ? (
        <p className="subtle">
          O modo emergência encerra de uma vez todas as outras sessões e remove o PIN de todos os aparelhos. Faz parte do
          Premium. No plano gratuito, encerre as sessões uma a uma em "Sessões ativas" e troque as senhas.
        </p>
      ) : !done ? (
        <>
          <p className="subtle">
            Um clique encerra todas as outras sessões (outros navegadores, celulares e a extensão) e remove o PIN de todos os
            aparelhos. Depois, troque a senha da conta e a senha mestra.
          </p>
          <div className="form__actions">
            <button type="button" className="btn btn--danger" disabled={busy} onClick={() => void activate()}>
              {busy ? 'Encerrando…' : 'Ativar modo emergência'}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="alert alert--ok">Outras sessões encerradas e PINs removidos. Agora:</div>
          <ol>
            <li>
              <form className="form" onSubmit={changePassword}>
                <label className="field">
                  Nova senha da conta (a de entrar)
                  <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </label>
                {passwordDone ? (
                  <div className="alert alert--ok">Senha da conta trocada.</div>
                ) : (
                  <div className="form__actions">
                    <button type="submit" className="btn btn--primary" disabled={busy || !password}>
                      Trocar senha da conta
                    </button>
                  </div>
                )}
              </form>
            </li>
            <li className="muted">Troque a senha mestra no cartão "Trocar a senha mestra", nesta página.</li>
            <li className="muted">Confira em Atividade o que foi feito e troque as senhas das contas mais importantes pela fila de rotação.</li>
          </ol>
        </>
      )}
      {error && <div className="alert alert--error">{error}</div>}
    </section>
  );
}
