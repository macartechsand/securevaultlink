import { type FormEvent, useState } from 'react';
import { passwordStrength } from '../lib/health/passwordHealth';
import { STRENGTH_LABELS, strengthBadge } from '../lib/labels';
import { friendlyError } from '../lib/messages';
import { ACCOUNT_PASSWORD_MIN_LENGTH } from '../services/authService';

/** Shown after an invite or password-reset link: the person chooses their ACCOUNT password. */
export function SetAccountPassword({ email, onSet, onSignOut }: { email: string; onSet: (password: string) => Promise<void>; onSignOut: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const strength = password ? passwordStrength(password, [email]) : null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (password.length < ACCOUNT_PASSWORD_MIN_LENGTH) return setError(`Use pelo menos ${ACCOUNT_PASSWORD_MIN_LENGTH} caracteres.`);
    if (password !== confirm) return setError('As senhas não coincidem.');
    if (strength === 'Weak') return setError('Senha fácil de adivinhar. Use uma frase mais longa.');
    setBusy(true);
    try {
      await onSet(password);
    } catch (err) {
      setError(friendlyError(err, 'Não foi possível definir a senha.'));
      setBusy(false);
    }
  };

  return (
    <>
      <div>
        <p className="eyebrow">Conta</p>
        <h2>Defina a senha da sua conta</h2>
        <p className="subtle">Conectado como {email}</p>
      </div>
      <div className="alert alert--info">
        Esta é a senha para <strong>entrar</strong> na conta. Em seguida você cria (ou usa) a sua <strong>senha mestra</strong>,
        separada, que criptografa o cofre. Redefinir a senha da conta não dá acesso ao cofre: só a senha mestra ou a chave de
        recuperação abrem os dados.
      </div>
      <form className="form" onSubmit={submit}>
        <label className="field">
          Nova senha da conta
          <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus required />
          {strength && (
            <span>
              <span className={`badge ${strengthBadge(strength)}`}>Força: {STRENGTH_LABELS[strength]}</span>
            </span>
          )}
        </label>
        <label className="field">
          Confirme a senha
          <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </label>
        {error && <div className="alert alert--error">{error}</div>}
        <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
          {busy ? 'Salvando…' : 'Salvar senha e continuar'}
        </button>
        <button type="button" className="btn btn--ghost btn--block" onClick={onSignOut}>
          Sair
        </button>
      </form>
    </>
  );
}
