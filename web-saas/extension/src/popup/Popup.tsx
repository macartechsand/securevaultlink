import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '../../../src/components/ui/Icon';
import { ProviderIcon } from '../../../src/components/ui/ProviderIcon';
import { OAUTH_PROVIDERS, type OAuthProvider } from '../../../src/lib/oauthProviders';
import { generatePassword } from '../../../src/lib/passwordGenerator';
import { analyzeUrl, safeHref } from '../../../src/lib/urlCheck';
import { type FillResponse, type ItemSummary, type StatusResponse, send } from '../protocol';

const WEB_APP_URL: string = import.meta.env.VITE_WEB_APP_URL || 'https://securelinkvaultdev.netlify.app';

type Tab = { id: number; url: string | null };

async function activeTab(): Promise<Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id ? { id: tab.id, url: tab.url ?? null } : null;
}

const openWebApp = () => void chrome.tabs.create({ url: WEB_APP_URL });

function Brand() {
  return (
    <div className="brand">
      <div className="brand__mark">
        <Icon name="shieldCheck" size={20} />
      </div>
      <div>
        <div className="brand__name">SecureLink Vault</div>
        <div className="brand__tag">Criptografia de ponta a ponta</div>
      </div>
    </div>
  );
}

function Center({ children }: { children: ReactNode }) {
  return (
    <div className="ext-center">
      <Brand />
      {children}
    </div>
  );
}

function useAsync() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = useCallback(async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Algo deu errado.');
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, run };
}

/* ------------------------------------------------------------------ screens before the vault */

function OAuthSignIn({ onDone, initialError }: { onDone: () => void; initialError?: string }) {
  const [enabled, setEnabled] = useState<OAuthProvider[]>([]);
  const [pending, setPending] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState(initialError ?? '');

  useEffect(() => {
    send<OAuthProvider[]>({ type: 'providers' }).then(setEnabled, () => setEnabled([]));
  }, []);

  if (enabled.length === 0) return error ? <div className="alert alert--error">{error}</div> : null;
  return (
    <div className="stack-sm">
      {OAUTH_PROVIDERS.filter((p) => enabled.includes(p.key)).map((p) => (
        <button
          key={p.key}
          type="button"
          className="btn btn--block"
          disabled={pending !== null}
          onClick={() => {
            setError('');
            setPending(p.key);
            // The popup usually closes when the provider window opens; the background finishes the
            // sign-in and reopens the popup.
            send({ type: 'signInOAuth', provider: p.key }).then(onDone, (err: Error) => {
              setError(err.message);
              setPending(null);
            });
          }}
        >
          <ProviderIcon provider={p.key} />
          {pending === p.key ? 'Aguardando o login…' : `Continuar com ${p.name}`}
        </button>
      ))}
      {error && <div className="alert alert--error">{error}</div>}
      <div className="divider">
        <span>ou com e-mail</span>
      </div>
    </div>
  );
}

function SignIn({ onDone, authError }: { onDone: () => void; authError?: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, run } = useAsync();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await send({ type: 'signIn', email, password });
      onDone();
    });
  };
  return (
    <Center>
      <div>
        <p className="eyebrow">Conta</p>
        <h2>Entrar</h2>
      </div>
      <OAuthSignIn onDone={onDone} initialError={authError} />
      <form className="form" onSubmit={submit}>
        <label className="field">
          E-mail
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        <label className="field">
          Senha da conta
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <div className="alert alert--error">{error}</div>}
        <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
      <button type="button" className="btn btn--ghost btn--block" onClick={openWebApp}>
        Abrir o app web
      </button>
    </Center>
  );
}

function Mfa({ email, onDone, onSignOut }: { email: string | null; onDone: () => void; onSignOut: () => void }) {
  const [code, setCode] = useState('');
  const { busy, error, run } = useAsync();
  return (
    <Center>
      <div>
        <p className="eyebrow">Verificação em duas etapas</p>
        <h2>Código do autenticador</h2>
        <p className="subtle">{email}</p>
      </div>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await send({ type: 'verifyMfa', code });
            onDone();
          });
        }}
      >
        <input inputMode="numeric" autoComplete="one-time-code" placeholder="000000" value={code} onChange={(e) => setCode(e.target.value)} required autoFocus />
        {error && <div className="alert alert--error">{error}</div>}
        <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
          Verificar
        </button>
      </form>
      <button type="button" className="btn btn--ghost btn--block" onClick={onSignOut}>
        Sair
      </button>
    </Center>
  );
}

function Unlock({ email, idleMinutes, onDone, onSignOut }: { email: string | null; idleMinutes: number; onDone: () => void; onSignOut: () => void }) {
  const [password, setPassword] = useState('');
  const { busy, error, run } = useAsync();
  return (
    <Center>
      <div>
        <p className="eyebrow">Cofre bloqueado</p>
        <h2>Desbloquear</h2>
        <p className="subtle">{email}</p>
      </div>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await send({ type: 'unlock', masterPassword: password });
            setPassword('');
            onDone();
          });
        }}
      >
        <label className="field">
          Senha mestra
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
          <span className="field__hint">Decifrada só neste navegador. Bloqueia após {idleMinutes} min sem uso.</span>
        </label>
        {error && <div className="alert alert--error">{error}</div>}
        <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
          <Icon name="lock" />
          {busy ? 'Desbloqueando…' : 'Desbloquear'}
        </button>
      </form>
      <button type="button" className="btn btn--ghost btn--block" onClick={onSignOut}>
        Sair da conta
      </button>
    </Center>
  );
}

/* ------------------------------------------------------------------ vault */

function hostOf(url: string | null) {
  if (!url || !/^https?:/i.test(url)) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function ItemRow({
  item,
  onFill,
  onCopy,
}: {
  item: ItemSummary;
  onFill: (item: ItemSummary) => void;
  onCopy: (item: ItemSummary, field: 'username' | 'password') => void;
}) {
  const href = item.url ? safeHref(item.url) : undefined;
  return (
    <li className={`ext-item ${item.match !== 'none' ? 'ext-item--match' : ''}`}>
      <div className="ext-item__main">
        <span className="avatar" aria-hidden="true">
          {item.title.slice(0, 1) || '?'}
        </span>
        <span className="ext-item__text">
          <strong>
            {item.favorite && (
              <span className="favorite" aria-label="Favorito">
                <Icon name="star" size={12} />
              </span>
            )}
            {item.title}
          </strong>
          <small>
            {item.username || 'sem usuário'}
            {item.shared ? ' · compartilhado comigo' : ''}
          </small>
        </span>
        <div className="ext-item__actions">
          <button type="button" className="btn btn--ghost icon-btn" title="Copiar usuário" aria-label="Copiar usuário" onClick={() => onCopy(item, 'username')}>
            <Icon name="user" size={16} />
          </button>
          <button type="button" className="btn btn--ghost icon-btn" title="Copiar senha (limpa em 30 s)" aria-label="Copiar senha" onClick={() => onCopy(item, 'password')}>
            <Icon name="copy" size={16} />
          </button>
          {href && (
            <button type="button" className="btn btn--ghost icon-btn" title="Abrir o site" aria-label="Abrir o site" onClick={() => void chrome.tabs.create({ url: href })}>
              <Icon name="link" size={16} />
            </button>
          )}
        </div>
      </div>
      <button type="button" className={`btn btn--sm btn--block ${item.match !== 'none' ? 'btn--primary' : ''}`} onClick={() => onFill(item)}>
        Preencher
      </button>
    </li>
  );
}

function Generator({ onCopied }: { onCopied: (msg: string) => void }) {
  const [length, setLength] = useState(20);
  const [uppercase, setUppercase] = useState(true);
  const [numbers, setNumbers] = useState(true);
  const [symbols, setSymbols] = useState(true);
  const [seed, setSeed] = useState(0);
  // A new password whenever an option changes or "Gerar outra" bumps the seed.
  const password = useMemo(() => {
    void seed;
    return generatePassword({ length, uppercase, numbers, symbols });
  }, [length, uppercase, numbers, symbols, seed]);
  return (
    <div className="stack">
      <div className="secret-box">
        <code>{password}</code>
      </div>
      <div className="row">
        <button
          type="button"
          className="btn btn--primary grow"
          onClick={async () => {
            await navigator.clipboard.writeText(password);
            await send({ type: 'clipboardCopied' }).catch(() => undefined);
            onCopied('Senha copiada. Limpa em 30 s.');
          }}
        >
          <Icon name="copy" />
          Copiar
        </button>
        <button type="button" className="btn" onClick={() => setSeed((s) => s + 1)}>
          <Icon name="refresh" />
          Gerar outra
        </button>
      </div>
      <label className="field">
        Tamanho: {length}
        <input type="range" min={12} max={64} value={length} onChange={(e) => setLength(Number(e.target.value))} />
      </label>
      <label className="check">
        <input type="checkbox" checked={uppercase} onChange={(e) => setUppercase(e.target.checked)} /> Letras maiúsculas
      </label>
      <label className="check">
        <input type="checkbox" checked={numbers} onChange={(e) => setNumbers(e.target.checked)} /> Números
      </label>
      <label className="check">
        <input type="checkbox" checked={symbols} onChange={(e) => setSymbols(e.target.checked)} /> Símbolos
      </label>
    </div>
  );
}

function Vault({ onLock, onSignOut }: { onLock: () => void; onSignOut: () => void }) {
  const [tab, setTab] = useState<Tab | null>(null);
  const [items, setItems] = useState<ItemSummary[] | null>(null);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'logins' | 'generator'>('logins');
  const [confirm, setConfirm] = useState<{ item: ItemSummary; reason: string } | null>(null);
  const [toast, setToast] = useState('');
  const { error, run } = useAsync();

  const notify = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2200);
  };

  useEffect(() => {
    void run(async () => {
      const t = await activeTab();
      setTab(t);
      setItems(await send<ItemSummary[]>({ type: 'list', tabUrl: t?.url ?? null }));
    });
  }, [run]);

  const host = hostOf(tab?.url ?? null);
  const findings = useMemo(() => (tab?.url && host ? analyzeUrl(tab.url).findings.filter((f) => f.severity !== 'low') : []), [tab, host]);
  const q = query.trim().toLowerCase();
  const matches = (items ?? []).filter((i) => i.match !== 'none');
  const shown = (items ?? []).filter(
    (i) => !q || i.title.toLowerCase().includes(q) || i.username.toLowerCase().includes(q) || i.url.toLowerCase().includes(q),
  );

  const fill = (item: ItemSummary, confirmMismatch = false) =>
    run(async () => {
      if (!tab) throw new Error('Nenhuma aba ativa.');
      const res = await send<FillResponse>({ type: 'fill', itemId: item.id, tabId: tab.id, confirmMismatch });
      if (res.ok) {
        window.close();
        return;
      }
      if (res.needsConfirm) setConfirm({ item, reason: res.reason });
      else throw new Error(res.error);
    });

  const copy = (item: ItemSummary, field: 'username' | 'password') =>
    run(async () => {
      const value = await send<string>({ type: 'reveal', itemId: item.id, field });
      if (!value) throw new Error(field === 'password' ? 'Este item não tem senha.' : 'Este item não tem usuário.');
      await navigator.clipboard.writeText(value);
      if (field === 'password') {
        await send({ type: 'clipboardCopied' });
        notify('Senha copiada. Limpa em 30 s.');
      } else notify('Usuário copiado.');
    });

  return (
    <>
      <header className="ext-header">
        <div className="brand__mark" aria-hidden="true">
          <Icon name="shieldCheck" size={16} />
        </div>
        <div className="ext-site">
          <strong>{host ?? 'Sem site nesta aba'}</strong>
          <small>{matches.length ? `${matches.length} login(s) para este site` : 'Nenhum login salvo para este site'}</small>
        </div>
        <button type="button" className="btn btn--ghost icon-btn" title="Bloquear" aria-label="Bloquear" onClick={onLock}>
          <Icon name="lock" />
        </button>
      </header>

      <div className="ext-body">
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={view === 'logins'} className={`tab ${view === 'logins' ? 'is-active' : ''}`} onClick={() => setView('logins')}>
            Logins
          </button>
          <button type="button" role="tab" aria-selected={view === 'generator'} className={`tab ${view === 'generator' ? 'is-active' : ''}`} onClick={() => setView('generator')}>
            Gerador
          </button>
        </div>

        {view === 'generator' && <Generator onCopied={notify} />}

        {view === 'logins' && (
          <>
            {findings.map((f) => (
              <div key={f.code} className={`alert ${f.severity === 'high' ? 'alert--error' : 'alert--warn'}`}>
                <Icon name="alert" size={14} /> Esta página: {f.message.toLowerCase()}.
              </div>
            ))}

            {confirm && (
              <div className="alert alert--warn stack-sm">
                <strong>O site não corresponde ao login</strong>
                <span>{confirm.reason} Preencha só se tiver certeza de que esta página é legítima.</span>
                <div className="row">
                  <button type="button" className="btn btn--sm btn--danger" onClick={() => void fill(confirm.item, true)}>
                    Preencher mesmo assim
                  </button>
                  <button type="button" className="btn btn--sm" onClick={() => setConfirm(null)}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}
            {error && <div className="alert alert--error">{error}</div>}

            <label className="search">
              <Icon name="search" size={15} />
              <span className="sr-only">Buscar logins</span>
              <input type="search" placeholder="Buscar por nome, usuário ou site" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
            </label>

            {items === null && !error && <p className="muted">Decifrando o cofre…</p>}

            {items && !q && matches.length > 0 && (
              <>
                <p className="ext-section-title">Para este site</p>
                <ul className="ext-list">
                  {matches.map((i) => (
                    <ItemRow key={i.id} item={i} onFill={(it) => void fill(it)} onCopy={copy} />
                  ))}
                </ul>
              </>
            )}

            {items && (
              <>
                <p className="ext-section-title">{q ? 'Resultados' : 'Todos os logins'}</p>
                {shown.length === 0 ? (
                  <p className="empty">{items.length === 0 ? 'Nenhum login no cofre ainda.' : 'Nada encontrado.'}</p>
                ) : (
                  <ul className="ext-list">
                    {shown
                      .filter((i) => q || i.match === 'none')
                      .map((i) => (
                        <ItemRow key={i.id} item={i} onFill={(it) => void fill(it)} onCopy={copy} />
                      ))}
                  </ul>
                )}
              </>
            )}
          </>
        )}
      </div>

      <footer className="ext-footer">
        <button type="button" className="btn btn--ghost btn--sm" onClick={openWebApp}>
          <Icon name="key" size={14} />
          Abrir o cofre web
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onSignOut}>
          <Icon name="logout" size={14} />
          Sair
        </button>
      </footer>
      {toast && (
        <div className="ext-toast" role="status">
          {toast}
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ root */

export function Popup() {
  const [state, setState] = useState<StatusResponse | null>(null);
  const [error, setError] = useState('');

  const refresh = useCallback(() => {
    setError('');
    send<StatusResponse>({ type: 'status' }).then(setState, (err: Error) => setError(err.message));
  }, []);
  useEffect(refresh, [refresh]);

  const signOut = () => void send({ type: 'signOut' }).then(refresh);
  const lock = () => void send({ type: 'lock' }).then(refresh);

  if (error) {
    return (
      <Center>
        <div className="alert alert--error">{error}</div>
        <button type="button" className="btn btn--primary btn--block" onClick={refresh}>
          Tentar novamente
        </button>
      </Center>
    );
  }
  if (!state) {
    return (
      <Center>
        <p className="muted">Carregando…</p>
      </Center>
    );
  }
  switch (state.status) {
    case 'signed-out':
      return <SignIn onDone={refresh} authError={state.authError} />;
    case 'needs-mfa':
      return <Mfa email={state.email} onDone={refresh} onSignOut={signOut} />;
    case 'needs-setup':
      return (
        <Center>
          <div className="alert alert--info">Esta conta ainda não tem cofre. Crie a senha mestra no app web e volte aqui.</div>
          <button type="button" className="btn btn--primary btn--block" onClick={openWebApp}>
            Abrir o app web
          </button>
          <button type="button" className="btn btn--ghost btn--block" onClick={signOut}>
            Sair
          </button>
        </Center>
      );
    case 'locked':
      return <Unlock email={state.email} idleMinutes={state.idleMinutes} onDone={refresh} onSignOut={signOut} />;
    case 'unlocked':
      return <Vault onLock={lock} onSignOut={signOut} />;
  }
}
