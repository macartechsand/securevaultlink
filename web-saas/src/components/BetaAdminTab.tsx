import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { formatDateTime, friendlyError } from '../lib/messages';
import { type BetaSettings, type InvitePlan, createInviteLink, fetchBetaSettings, inviteEmail, setSetting, uninviteEmail } from '../services/adminService';
import { OneTimeLink } from './OneTimeLink';
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
  const [plan, setPlan] = useState<'free' | 'premium'>('free');
  const [premiumDays, setPremiumDays] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [oneTime, setOneTime] = useState<{ email: string; link: string } | null>(null);

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

  const invitePlan = (): InvitePlan => {
    if (plan === 'free' || premiumDays.trim() === '') return { plan, premiumDays: null };
    const days = Number(premiumDays);
    if (!Number.isInteger(days) || days < 1 || days > 3650) throw new Error('Duração do Premium: de 1 a 3650 dias (ou em branco para sem prazo).');
    return { plan, premiumDays: days };
  };

  const clearForm = () => {
    setEmail('');
    setNote('');
    setPlan('free');
    setPremiumDays('');
  };

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
          <label className="field">
            Verificação em duas etapas para todos
            <select value={draft.require_mfa_all ?? 'false'} onChange={(e) => setDraft((d) => ({ ...d, require_mfa_all: e.target.value }))} disabled={!canAct}>
              <option value="false">Opcional (cada administrador pode exigir por usuário)</option>
              <option value="true">Obrigatória para todos os usuários</option>
            </select>
            <span className="field__hint">Quando obrigatória, quem não tiver segundo fator precisa ativar antes de acessar o cofre.</span>
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
            Só estes e-mails conseguem criar conta. <strong>Convidar</strong> apenas autoriza o endereço (a pessoa se cadastra e
            confirma por e-mail). <strong>Gerar link de acesso</strong> cria a conta já confirmada e mostra um link para você
            enviar por outro canal: use quando os e-mails do Supabase não estiverem chegando. Escolha <strong>Premium</strong>{' '}
            para a pessoa já entrar no plano pago, com ou sem prazo (contado a partir do cadastro; se a conta já existir, vale na
            hora). Todo convite conta no limite de usuários.
          </p>
        </div>
        {canAct && (
          <form
            className="field__inline"
            onSubmit={(e) => {
              e.preventDefault();
              void run(`${email} convidado${plan === 'premium' ? ' (Premium)' : ''}.`, async () => {
                await inviteEmail(email, note, invitePlan());
                clearForm();
              });
            }}
          >
            <input type="email" placeholder="email@exemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <input placeholder="Observação (opcional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
            <select aria-label="Plano do convite" value={plan} onChange={(e) => setPlan(e.target.value as 'free' | 'premium')}>
              <option value="free">Gratuito</option>
              <option value="premium">Premium</option>
            </select>
            {plan === 'premium' && (
              <input
                type="number"
                min={1}
                max={3650}
                inputMode="numeric"
                aria-label="Dias de Premium"
                placeholder="Dias (vazio = sem prazo)"
                value={premiumDays}
                onChange={(e) => setPremiumDays(e.target.value)}
              />
            )}
            <button type="submit" className="btn" disabled={busy}>
              <Icon name="plus" size={14} />
              Convidar
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy || !email}
              onClick={() =>
                void run('Conta criada. Envie o link à pessoa.', async () => {
                  // Registers the plan first: the account is created by the link and picks it up at sign-up.
                  await inviteEmail(email, note, invitePlan());
                  setOneTime(await createInviteLink(email));
                  clearForm();
                })
              }
            >
              <Icon name="link" size={14} />
              Convidar e gerar link
            </button>
          </form>
        )}
        {oneTime && <OneTimeLink email={oneTime.email} link={oneTime.link} kind="invite" onClose={() => setOneTime(null)} />}
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
                  <span className={`badge ${i.registered ? 'badge--ok' : ''}`}>{i.registered ? 'cadastrado' : 'aguardando cadastro'}</span>{' '}
                  {i.plan === 'premium' && (
                    <span className="badge badge--info">{i.premium_days ? `Premium · ${i.premium_days} dias` : 'Premium'}</span>
                  )}
                  <span className="subtle block">
                    {i.note ? `${i.note} · ` : ''}convidado em {formatDateTime(i.created_at)}
                  </span>
                </span>
                {canAct && !i.registered && (
                  <span className="row">
                    <button
                      type="button"
                      className="btn btn--sm"
                      disabled={busy}
                      onClick={() => void run('Conta criada. Envie o link à pessoa.', async () => setOneTime(await createInviteLink(i.email)))}
                    >
                      Gerar link de acesso
                    </button>
                    <button type="button" className="btn btn--sm btn--danger" disabled={busy} onClick={() => void run('Convite removido.', () => uninviteEmail(i.email))}>
                      Remover
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
