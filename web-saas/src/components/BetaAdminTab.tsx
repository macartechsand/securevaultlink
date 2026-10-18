import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { formatDateTime, friendlyError } from '../lib/messages';
import { type BetaSettings, fetchBetaSettings, inviteEmail, setSetting, uninviteEmail } from '../services/adminService';
import { Icon } from './ui/Icon';

const NUMERIC = [
  { key: 'max_users', label: 'Máximo de contas', hint: 'Cadastros param ao atingir este número (contas existentes contam).' },
  { key: 'free_quota_mb', label: 'Cota do plano gratuito (MB por usuário)', hint: 'Supabase Free tem 1 GB no total: 10 usuários × 80 MB = 800 MB.' },
  { key: 'premium_quota_mb', label: 'Cota do Premium (MB por usuário)', hint: 'Aumente quando os arquivos Premium estiverem no Cloudflare R2.' },
];

/** Closed-beta controls: invite list, account cap and quotas (admin role only). */
export function BetaAdminTab({ canAct }: { canAct: boolean }) {
  const [data, setData] = useState<BetaSettings | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await fetchBetaSettings();
      setData(d);
      setDraft(d.settings);
    } catch (e) {
      setError(friendlyError(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setError('');
    setInfo('');
    setBusy(true);
    try {
      await fn();
      setInfo(label);
      await load();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <p className="muted">{error || 'Carregando…'}</p>;
  const settings = data.settings;
  const maxUsers = Number(settings.max_users ?? 10);

  const saveSettings = (event: FormEvent) => {
    event.preventDefault();
    const changed = Object.entries(draft).filter(([k, v]) => settings[k] !== v);
    void run('Configurações salvas.', async () => {
      for (const [k, v] of changed) await setSetting(k, v.trim());
    });
  };

  return (
    <div className="stack">
      <section className="card">
        <div className="card__header">
          <div>
            <p className="eyebrow">Beta fechado</p>
            <h2>
              {data.users} de {maxUsers} contas usadas
            </h2>
          </div>
          <span className={`badge ${settings.signup_mode === 'open' ? 'badge--warn' : 'badge--ok'}`}>
            {settings.signup_mode === 'open' ? 'Cadastro aberto' : 'Só convidados'}
          </span>
        </div>
        <div className={`meter ${data.users >= maxUsers ? 'meter--danger' : data.users >= maxUsers * 0.8 ? 'meter--warn' : ''}`} aria-hidden="true">
          <span className={`w-${Math.min(10, Math.round((data.users / Math.max(maxUsers, 1)) * 10))}`} />
        </div>
        <form className="form" onSubmit={saveSettings}>
          <label className="field">
            Modo de cadastro
            <select value={draft.signup_mode ?? 'allowlist'} onChange={(e) => setDraft((d) => ({ ...d, signup_mode: e.target.value }))} disabled={!canAct}>
              <option value="allowlist">Só e-mails convidados (recomendado no beta)</option>
              <option value="open">Aberto a qualquer pessoa (respeita o máximo de contas)</option>
            </select>
          </label>
          <div className="grid grid--2">
            {NUMERIC.map((f) => (
              <label key={f.key} className="field">
                {f.label}
                <input
                  inputMode="numeric"
                  value={draft[f.key] ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                  disabled={!canAct}
                />
                <span className="field__hint">{f.hint}</span>
              </label>
            ))}
          </div>
          {canAct && (
            <div className="form__actions">
              <button type="submit" className="btn btn--primary" disabled={busy}>
                Salvar configurações
              </button>
            </div>
          )}
        </form>
      </section>

      <section className="card">
        <div>
          <p className="eyebrow">Convites</p>
          <h2>E-mails autorizados ({data.invites.length})</h2>
          <p className="subtle">
            Só estes e-mails conseguem criar conta. O convite não envia e-mail: avise a pessoa para se cadastrar com
            exatamente este endereço.
          </p>
        </div>
        {canAct && (
          <form
            className="field__inline"
            onSubmit={(e) => {
              e.preventDefault();
              void run(`${email} convidado.`, async () => {
                await inviteEmail(email, note);
                setEmail('');
                setNote('');
              });
            }}
          >
            <input type="email" placeholder="email@exemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <input placeholder="Observação (opcional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
            <button type="submit" className="btn" disabled={busy}>
              <Icon name="plus" size={14} />
              Convidar
            </button>
          </form>
        )}
        {info && <div className="alert alert--ok">{info}</div>}
        {error && <div className="alert alert--error">{error}</div>}
        {data.invites.length === 0 ? (
          <p className="empty">Nenhum convite.</p>
        ) : (
          <ul className="list">
            {data.invites.map((i) => (
              <li key={i.email}>
                <span>
                  <strong>{i.email}</strong>{' '}
                  <span className={`badge ${i.registered ? 'badge--ok' : ''}`}>{i.registered ? 'cadastrado' : 'aguardando cadastro'}</span>
                  <span className="subtle block">
                    {i.note ? `${i.note} · ` : ''}convidado em {formatDateTime(i.created_at)}
                  </span>
                </span>
                {canAct && !i.registered && (
                  <button type="button" className="btn btn--sm btn--danger" disabled={busy} onClick={() => void run('Convite removido.', () => uninviteEmail(i.email))}>
                    Remover
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
