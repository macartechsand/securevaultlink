import { type FormEvent, useState } from 'react';
import { PIN_MAX_LENGTH, validatePin } from '../lib/crypto/pinCrypto';
import { friendlyError } from '../lib/messages';
import { readPinRecord } from '../services/pinService';

type PinSettingsProps = {
  userId: string;
  available: boolean;
  onEnable: (masterPassword: string, pin: string) => Promise<{ expiresAt: string }>;
  onDisable: (all: boolean) => Promise<void>;
};

/** Quick unlock with a PIN on this device (all plans). */
export function PinSettings({ userId, available, onEnable, onDisable }: PinSettingsProps) {
  const [open, setOpen] = useState(false);
  const [master, setMaster] = useState('');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const record = available ? readPinRecord(userId) : null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    const problem = validatePin(pin);
    if (problem) return setError(problem);
    if (pin !== confirm) return setError('Os PINs não coincidem.');
    setBusy(true);
    try {
      await onEnable(master, pin);
      setOpen(false);
      setMaster('');
      setPin('');
      setConfirm('');
      setInfo('PIN ativado neste aparelho.');
    } catch (err) {
      setError(friendlyError(err, 'Não foi possível ativar o PIN.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (all: boolean) => {
    setError('');
    setBusy(true);
    try {
      await onDisable(all);
      setInfo(all ? 'PIN removido de todos os aparelhos.' : 'PIN removido deste aparelho.');
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <div className="card__header">
        <div>
          <p className="eyebrow">Desbloqueio rápido</p>
          <h2>PIN deste aparelho</h2>
        </div>
        <span className={`badge ${available ? 'badge--ok' : ''}`}>{available ? 'Ativo' : 'Desativado'}</span>
      </div>
      <p className="subtle">
        Abra o cofre com um PIN de 6 a {PIN_MAX_LENGTH} dígitos em vez da senha mestra. O PIN sozinho não abre nada: o servidor
        confere cada tentativa e, depois de 5 erros, o PIN é desativado. A cada 14 dias a senha mestra é pedida de novo. Ative só
        em aparelhos que são só seus.
      </p>
      {record && <p className="muted">Válido até {new Date(record.expiresAt).toLocaleDateString('pt-BR')}.</p>}
      {info && <div className="alert alert--ok">{info}</div>}
      {error && <div className="alert alert--error">{error}</div>}

      {open ? (
        <form className="form" onSubmit={submit}>
          <label className="field">
            Senha mestra
            <input type="password" autoComplete="current-password" value={master} onChange={(e) => setMaster(e.target.value)} required />
          </label>
          <div className="grid grid--2">
            <label className="field">
              Novo PIN
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={PIN_MAX_LENGTH}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                required
              />
            </label>
            <label className="field">
              Confirme o PIN
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={PIN_MAX_LENGTH}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ''))}
                required
              />
            </label>
          </div>
          <div className="form__actions">
            <button type="submit" className="btn btn--primary" disabled={busy}>
              {busy ? 'Ativando…' : 'Ativar PIN'}
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setOpen(false)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <div className="form__actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              setInfo('');
              setOpen(true);
            }}
          >
            {available ? 'Trocar PIN' : 'Ativar PIN'}
          </button>
          {available && (
            <button type="button" className="btn" disabled={busy} onClick={() => void remove(false)}>
              Desativar neste aparelho
            </button>
          )}
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void remove(true)}>
            Remover de todos os aparelhos
          </button>
        </div>
      )}
    </section>
  );
}
