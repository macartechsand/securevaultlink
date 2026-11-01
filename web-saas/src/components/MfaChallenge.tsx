import { type FormEvent, useState } from 'react';
import { friendlyError } from '../lib/messages';

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
      setError(friendlyError(err, 'Falha na verificação.'));
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div>
        <p className="eyebrow">Verificação em duas etapas</p>
        <h2>Digite o código do autenticador</h2>
        <p className="subtle">Conectado como {email}</p>
      </div>
      <form className="form" onSubmit={submit}>
        <label className="field">
          Código de 6 dígitos
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
        {error && <div className="alert alert--error">{error}</div>}
        <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
          {busy ? 'Verificando…' : 'Verificar'}
        </button>
        <button type="button" className="btn btn--ghost btn--block" onClick={onSignOut}>
          Sair
        </button>
      </form>
      <p className="subtle">Perdeu o autenticador? Fale com o suporte: um administrador precisa remover o fator da sua conta.</p>
    </>
  );
}
