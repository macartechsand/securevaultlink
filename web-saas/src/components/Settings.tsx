import { type FormEvent, useState } from 'react';
import { friendlyError } from '../lib/messages';
import { MfaSettings } from './MfaSettings';
import { RecoverySettings } from './RecoverySettings';
import { SessionsCard } from './SessionsCard';
import { ThemeToggle } from './ui/ThemeToggle';

type SettingsProps = {
  email: string;
  idleMinutes: number;
  onChangePassword: (current: string, next: string) => Promise<void>;
  onLock: () => void;
  recoveryEnabled: boolean;
  onEnableRecovery: (masterPassword: string) => Promise<string>;
  onDisableRecovery: (masterPassword: string) => Promise<void>;
};

export function Settings({
  email,
  idleMinutes,
  onChangePassword,
  onLock,
  recoveryEnabled,
  onEnableRecovery,
  onDisableRecovery,
}: SettingsProps) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setDone(false);
    setBusy(true);
    try {
      await onChangePassword(current, next);
      setCurrent('');
      setNext('');
      setDone(true);
    } catch (err) {
      setError(friendlyError(err, 'Não foi possível trocar a senha mestra.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid--2">
      <MfaSettings />
      <RecoverySettings enabled={recoveryEnabled} onEnable={onEnableRecovery} onDisable={onDisableRecovery} />
      <SessionsCard />

      <section className="card">
        <div>
          <p className="eyebrow">Criptografia</p>
          <h2>Trocar a senha mestra</h2>
        </div>
        <form className="form" onSubmit={submit}>
          <label className="field">
            Senha mestra atual
            <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          </label>
          <label className="field">
            Nova senha mestra
            <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required />
          </label>
          {done && <div className="alert alert--ok">Senha mestra trocada. Suas credenciais continuam intactas.</div>}
          {error && <div className="alert alert--error">{error}</div>}
          <div className="form__actions">
            <button type="submit" className="btn btn--primary" disabled={busy}>
              {busy ? 'Processando…' : 'Trocar senha mestra'}
            </button>
          </div>
        </form>
        <p className="subtle">
          {recoveryEnabled
            ? 'Se esquecer a senha mestra, use a chave de recuperação na tela de desbloqueio.'
            : 'Sem chave de recuperação, uma senha mestra esquecida significa que ninguém consegue descriptografar o cofre.'}
        </p>
      </section>

      <section className="card">
        <div>
          <p className="eyebrow">Sessão</p>
          <h2>Bloqueio e aparência</h2>
        </div>
        <p className="muted">Conectado como {email}.</p>
        <p className="muted">
          O cofre é bloqueado automaticamente após {idleMinutes} minutos sem uso. Os dados descriptografados ficam só na
          memória deste navegador.
        </p>
        <div className="row">
          <button type="button" className="btn" onClick={onLock}>
            Bloquear agora
          </button>
          <ThemeToggle />
        </div>
      </section>
    </div>
  );
}
