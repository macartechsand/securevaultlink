import { type FormEvent, useEffect, useState } from 'react';
import { friendlyError } from '../lib/messages';
import { MASTER_PASSWORD_MIN_LENGTH, validateMasterPassword } from '../state/useVaultSession';

type VaultGateProps = {
  mode: 'needs-setup' | 'locked';
  email: string;
  onSetup: (masterPassword: string) => Promise<void>;
  onUnlock: (masterPassword: string) => Promise<void>;
  hasRecovery: boolean;
  onRecover: (recoveryKey: string, newMasterPassword: string) => Promise<void>;
  onResetVault: () => Promise<void>;
  onSignOut: () => void;
};

const RESET_PHRASE = 'APAGAR COFRE';

// Progressive delay after wrong master passwords or recovery keys (per tab; survives a reload).
// The real defense is the KDF cost; this slows down guessing at an unattended, signed-in device.
const FAILS_KEY = 'sv.unlockFails';
const FREE_ATTEMPTS = 3;
type Fails = { n: number; until: number };
function readFails(): Fails {
  try {
    const v = JSON.parse(sessionStorage.getItem(FAILS_KEY) ?? 'null') as Fails | null;
    return v && typeof v.n === 'number' && typeof v.until === 'number' ? v : { n: 0, until: 0 };
  } catch {
    return { n: 0, until: 0 };
  }
}
function writeFails(v: Fails | null) {
  try {
    if (v) sessionStorage.setItem(FAILS_KEY, JSON.stringify(v));
    else sessionStorage.removeItem(FAILS_KEY);
  } catch {
    /* storage unavailable: the delay then lasts only while this screen is open */
  }
}
/** Seconds to wait after n failures: 0 for the first 3, then 5, 10, 20… up to 5 minutes. */
export function unlockDelaySeconds(n: number) {
  return n < FREE_ATTEMPTS ? 0 : Math.min(300, 5 * 2 ** (n - FREE_ATTEMPTS));
}

export function VaultGate({ mode, email, onSetup, onUnlock, hasRecovery, onRecover, onResetVault, onSignOut }: VaultGateProps) {
  const [resetting, setResetting] = useState(false);
  const [resetTyped, setResetTyped] = useState('');
  const [password, setPassword] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState('');
  const [confirm, setConfirm] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fails, setFails] = useState<Fails>(readFails);
  const [now, setNow] = useState(() => Date.now());
  const setup = mode === 'needs-setup';
  const waitSeconds = setup ? 0 : Math.max(0, Math.ceil((fails.until - now) / 1000));

  useEffect(() => {
    if (fails.until <= Date.now()) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [fails.until]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (waitSeconds > 0) return;
    setError('');
    setBusy(true);
    try {
      if (setup) {
        if (password !== confirm) throw new Error('Master passwords do not match.');
        await onSetup(password);
      } else if (useRecovery) {
        const problem = validateMasterPassword(password);
        if (problem) throw new Error(problem);
        if (password !== confirm) throw new Error('Master passwords do not match.');
        await onRecover(recoveryKey, password);
      } else {
        await onUnlock(password);
      }
      setPassword('');
      setConfirm('');
      setRecoveryKey('');
      writeFails(null);
    } catch (err) {
      setError(friendlyError(err));
      if (!setup) {
        const n = fails.n + 1;
        const next = { n, until: Date.now() + unlockDelaySeconds(n) * 1000 };
        writeFails(next);
        setFails(next);
        setNow(Date.now());
      }
    } finally {
      setBusy(false);
    }
  };

  const confirmReset = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await onResetVault();
      setResetting(false);
      setResetTyped('');
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const closeReset = () => {
    setResetting(false);
    setResetTyped('');
    setError('');
  };

  if (resetting && !setup) {
    return (
      <>
        <div>
          <p className="eyebrow">Cofre bloqueado</p>
          <h2>Recomeçar o cofre</h2>
          <p className="subtle">Conectado como {email}</p>
        </div>
        <div className="alert alert--error">
          A senha mestra nunca sai do seu dispositivo, então <strong>ninguém consegue redefini-la</strong>, nem o
          administrador.{hasRecovery ? ' Você tem uma chave de recuperação: use-a para trocar a senha sem perder nada.' : ''}{' '}
          Recomeçar <strong>apaga para sempre</strong> todos os itens, arquivos, pastas e compartilhamentos deste cofre e
          cria um cofre novo e vazio. Sua conta, a verificação em duas etapas e seus acessos continuam.
        </div>
        <form className="form" onSubmit={confirmReset}>
          <label className="field">
            Digite {RESET_PHRASE} para confirmar
            <input value={resetTyped} onChange={(e) => setResetTyped(e.target.value)} autoComplete="off" spellCheck={false} autoFocus />
          </label>
          {error && <div className="alert alert--error">{error}</div>}
          <button type="submit" className="btn btn--danger btn--block" disabled={busy || resetTyped.trim().toUpperCase() !== RESET_PHRASE}>
            {busy ? 'Apagando…' : 'Apagar o cofre e recomeçar'}
          </button>
          <button type="button" className="btn btn--ghost btn--block" onClick={closeReset}>
            Voltar
          </button>
        </form>
      </>
    );
  }

  const title = setup ? 'Crie sua senha mestra' : useRecovery ? 'Recuperar com a chave de recuperação' : 'Desbloquear o cofre';
  return (
    <>
      <div>
        <p className="eyebrow">{setup ? 'Novo cofre' : 'Cofre bloqueado'}</p>
        <h2>{title}</h2>
        <p className="subtle">Conectado como {email}</p>
      </div>
      {setup && (
        <div className="alert alert--warn">
          A senha mestra criptografa tudo neste dispositivo antes de enviar ao servidor. Ela nunca é armazenada nem
          enviada, então <strong>ninguém consegue redefini-la para você</strong>. Depois de criar o cofre, você pode
          ativar uma chave de recuperação opcional em Configurações; sem ela, esquecer a senha mestra significa perder o
          cofre. Use pelo menos {MASTER_PASSWORD_MIN_LENGTH} caracteres (uma frase longa funciona bem).
        </div>
      )}
      <form className="form" onSubmit={submit}>
        {useRecovery && (
          <label className="field">
            Chave de recuperação
            <input value={recoveryKey} onChange={(e) => setRecoveryKey(e.target.value)} autoComplete="off" spellCheck={false} required />
          </label>
        )}
        <label className="field">
          {useRecovery ? 'Nova senha mestra' : 'Senha mestra'}
          <input
            type="password"
            autoComplete={setup || useRecovery ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            required
          />
        </label>
        {(setup || useRecovery) && (
          <label className="field">
            Confirme a {useRecovery ? 'nova ' : ''}senha mestra
            <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </label>
        )}
        {setup && (
          <label className="check">
            <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
            Entendo que, sem chave de recuperação, uma senha mestra esquecida não pode ser recuperada.
          </label>
        )}
        {error && <div className="alert alert--error">{error}</div>}
        {waitSeconds > 0 && (
          <div className="alert alert--warn" role="status">
            {fails.n} tentativas erradas. Aguarde {waitSeconds} s para tentar de novo.
          </div>
        )}
        <button type="submit" className="btn btn--primary btn--block" disabled={busy || waitSeconds > 0 || (setup && !understood)}>
          {busy ? 'Processando…' : waitSeconds > 0 ? `Aguarde ${waitSeconds} s` : setup ? 'Criar cofre' : useRecovery ? 'Recuperar cofre' : 'Desbloquear'}
        </button>
        {!setup && hasRecovery && (
          <button type="button" className="btn btn--ghost btn--block" onClick={() => setUseRecovery((v) => !v)}>
            {useRecovery ? 'Usar a senha mestra' : 'Esqueci a senha mestra'}
          </button>
        )}
        {!setup && !useRecovery && (
          <button type="button" className="btn btn--ghost btn--block" onClick={() => setResetting(true)}>
            {hasRecovery ? 'Perdi a senha mestra e a chave de recuperação' : 'Esqueci a senha mestra'}
          </button>
        )}
        <button type="button" className="btn btn--ghost btn--block" onClick={onSignOut}>
          Sair
        </button>
      </form>
    </>
  );
}
