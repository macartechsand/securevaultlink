import { type FormEvent, useState } from 'react';
import { friendlyError } from '../lib/messages';
import { ContingencyCard } from './ContingencyCard';
import { EmergencyCard } from './EmergencyCard';
import { PinSettings } from './PinSettings';
import { MfaSettings } from './MfaSettings';
import { RecoverySettings } from './RecoverySettings';
import { PrivacyCard } from './PrivacyCard';
import { RotationRemindersCard } from './RotationRemindersCard';
import { SessionsCard } from './SessionsCard';
import { ThemeToggle } from './ui/ThemeToggle';

type SettingsProps = {
  userId: string;
  email: string;
  idleMinutes: number;
  onChangePassword: (current: string, next: string) => Promise<void>;
  onLock: () => void;
  recoveryEnabled: boolean;
  onEnableRecovery: (masterPassword: string) => Promise<string>;
  onDisableRecovery: (masterPassword: string) => Promise<void>;
  onTestRecovery: (recoveryKey: string) => Promise<boolean>;
  mfaEnabled: boolean;
  premium: boolean;
  pinAvailable: boolean;
  onEnablePin: (masterPassword: string, pin: string) => Promise<{ expiresAt: string }>;
  onDisablePin: (all: boolean) => Promise<void>;
  onEmergency: () => Promise<void>;
  onChangeAccountPassword: (password: string) => Promise<void>;
};

export function Settings({
  userId,
  email,
  idleMinutes,
  onChangePassword,
  onLock,
  recoveryEnabled,
  onEnableRecovery,
  onDisableRecovery,
  onTestRecovery,
  mfaEnabled,
  premium,
  pinAvailable,
  onEnablePin,
  onDisablePin,
  onEmergency,
  onChangeAccountPassword,
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
      <ContingencyCard userId={userId} recoveryEnabled={recoveryEnabled} mfaEnabled={mfaEnabled} onTestRecovery={onTestRecovery} />
      <EmergencyCard premium={premium} onEmergency={onEmergency} onChangeAccountPassword={onChangeAccountPassword} />
      <MfaSettings />
      <PinSettings userId={userId} available={pinAvailable} onEnable={onEnablePin} onDisable={onDisablePin} />
      <RecoverySettings enabled={recoveryEnabled} onEnable={onEnableRecovery} onDisable={onDisableRecovery} />
      <SessionsCard />
      <RotationRemindersCard userId={userId} />
      <PrivacyCard />

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
