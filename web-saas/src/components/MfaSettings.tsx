import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { friendlyError } from '../lib/messages';
import { logClientEvent } from '../services/auditService';
import { enrollTotp, listVerifiedTotpFactors, type TotpFactor, unenrollTotp, verifyTotp } from '../services/mfaService';

export function MfaSettings() {
  const [factors, setFactors] = useState<TotpFactor[] | null>(null);
  const [enrollment, setEnrollment] = useState<{ factorId: string; qrCode: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const refresh = useCallback(async () => {
    try {
      setFactors((await listVerifiedTotpFactors()).filter((f) => f.status === 'verified'));
    } catch (err) {
      setError(friendlyError(err, 'Não foi possível carregar o status da verificação em duas etapas.'));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (action: () => Promise<void>) => {
    setError('');
    setInfo('');
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const confirmEnrollment = (event: FormEvent) => {
    event.preventDefault();
    if (!enrollment) return;
    void run(async () => {
      await verifyTotp(enrollment.factorId, code);
      logClientEvent('mfa.enrolled');
      setEnrollment(null);
      setCode('');
      setInfo('Verificação em duas etapas ativada. O código do autenticador será pedido a cada login.');
      await refresh();
    });
  };

  const enabled = (factors?.length ?? 0) > 0;

  return (
    <section className="card">
      <div className="card__header">
        <div>
          <p className="eyebrow">Segurança da conta</p>
          <h2>Verificação em duas etapas</h2>
        </div>
        {factors && <span className={`badge ${enabled ? 'badge--ok' : 'badge--warn'}`}>{enabled ? 'Ativada' : 'Desativada'}</span>}
      </div>

      {!enabled && !enrollment && (
        <>
          <p className="muted">
            Proteja a conta com um código de 6 dígitos de um app autenticador (Google Authenticator, Microsoft
            Authenticator, Authy, 1Password…).
          </p>
          <div>
            <button type="button" className="btn btn--primary" disabled={busy || !factors} onClick={() => void run(async () => setEnrollment(await enrollTotp()))}>
              Ativar verificação em duas etapas
            </button>
          </div>
        </>
      )}

      {enrollment && (
        <form className="form" onSubmit={confirmEnrollment}>
          <p>1. Escaneie o QR code com o app autenticador.</p>
          <img className="qr" src={enrollment.qrCode} alt="QR code para o app autenticador" width={180} height={180} />
          <p className="subtle">
            Ou digite esta chave manualmente: <code>{enrollment.secret}</code>
          </p>
          <label className="field">
            2. Digite o código de 6 dígitos exibido no app
            <input inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} required />
          </label>
          <div className="form__actions">
            <button type="submit" className="btn btn--primary" disabled={busy}>
              {busy ? 'Verificando…' : 'Confirmar'}
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setEnrollment(null)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {enabled && (
        <>
          <p className="muted">Todo login exige o código do autenticador. Sem ele, os dados do cofre não podem ser lidos.</p>
          <div>
            <button
              type="button"
              className="btn btn--danger"
              disabled={busy}
              onClick={() => {
                if (!window.confirm('Desativar a verificação em duas etapas?')) return;
                void run(async () => {
                  for (const f of factors ?? []) await unenrollTotp(f.id);
                  logClientEvent('mfa.disabled');
                  setInfo('Verificação em duas etapas desativada.');
                  await refresh();
                });
              }}
            >
              Desativar
            </button>
          </div>
        </>
      )}

      {info && <div className="alert alert--ok">{info}</div>}
      {error && <div className="alert alert--error">{error}</div>}
      <p className="subtle">
        Mantenha acesso ao autenticador. Se perdê-lo, um administrador precisa remover o fator antes que você consiga
        entrar de novo.
      </p>
    </section>
  );
}
