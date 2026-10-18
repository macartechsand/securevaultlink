import { useCallback, useMemo, useState } from 'react';
import { ActivityView } from './components/ActivityView';
import { AuthScreen } from './components/AuthScreen';
import { EntryForm } from './components/EntryForm';
import { FilesView } from './components/FilesView';
import { Generator } from './components/Generator';
import { MfaChallenge } from './components/MfaChallenge';
import { PasswordTable } from './components/PasswordTable';
import { Settings } from './components/Settings';
import { NAV_ITEMS, Sidebar } from './components/Sidebar';
import { StatCard } from './components/StatCard';
import { TransferDownload } from './components/TransferDownload';
import { VaultGate } from './components/VaultGate';
import { CenterLayout } from './components/ui/CenterLayout';
import { Icon } from './components/ui/Icon';
import { analyzeHealth, passwordStrength, type Strength } from './lib/health/passwordHealth';
import { checkPwnedMany, type PwnedResult } from './lib/health/pwned';
import { categoryLabel } from './lib/labels';
import { friendlyError } from './lib/messages';
import { isSupabaseConfigured } from './lib/supabase';
import { checkUrlsReputation, type UrlReputation } from './services/urlReputation';
import { IDLE_LOCK_MS, type VaultEntry, useVaultSession } from './state/useVaultSession';

/** Public transfer links: /?transfer=<id>#k=<secret>. The secret never leaves the browser. */
function readTransferLink() {
  const id = new URLSearchParams(window.location.search).get('transfer');
  if (!id) return null;
  const secret = new URLSearchParams(window.location.hash.slice(1)).get('k') ?? '';
  return { id, secret };
}

function App() {
  const [transferLink] = useState(readTransferLink);
  if (transferLink && isSupabaseConfigured) {
    return <TransferDownload transferId={transferLink.id} linkSecret={transferLink.secret} />;
  }
  return <VaultApp />;
}

const PAGE_TITLES: Record<string, { title: string; subtitle: string }> = {
  dashboard: { title: 'Visão geral', subtitle: 'Saúde das suas credenciais, calculada só com dados reais.' },
  vault: { title: 'Cofre', subtitle: 'Credenciais criptografadas no seu dispositivo.' },
  files: { title: 'Arquivos', subtitle: 'Arquivos, compartilhamentos e transferências temporárias.' },
  generator: { title: 'Gerador', subtitle: 'Senhas fortes geradas no navegador.' },
  activity: { title: 'Atividade', subtitle: 'Log de auditoria da sua conta.' },
  settings: { title: 'Configurações', subtitle: 'Segurança da conta, recuperação e sessão.' },
};

function VaultApp() {
  const session = useVaultSession();
  const { status, user, entries } = session;
  const [activeView, setActiveView] = useState('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [editing, setEditing] = useState<VaultEntry | 'new' | null>(null);
  const [actionError, setActionError] = useState('');
  const [pwnedById, setPwnedById] = useState<Map<string, PwnedResult>>(new Map());
  const [siteById, setSiteById] = useState<Map<string, UrlReputation>>(new Map());
  const [checking, setChecking] = useState(false);

  const health = useMemo(() => analyzeHealth(entries), [entries]);
  const strengthById = useMemo(() => {
    const map = new Map<string, Strength>();
    for (const e of entries) map.set(e.id, passwordStrength(e.password, [e.title, e.username]));
    return map;
  }, [entries]);
  const reusedIds = useMemo(() => new Set(health.reused), [health]);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return entries;
    return entries.filter((e) =>
      [e.title, e.username, e.url, e.category, categoryLabel(e.category)].some((field) => field.toLowerCase().includes(term)),
    );
  }, [entries, searchTerm]);

  const exposedCount = useMemo(
    () =>
      entries.filter((e) => {
        const r = pwnedById.get(e.id);
        return r?.status === 'ok' && r.count > 0;
      }).length,
    [entries, pwnedById],
  );
  const checkedCount = [...pwnedById.values()].filter((r) => r.status === 'ok').length;
  const unsafeSites = entries.filter((e) => siteById.get(e.id)?.status === 'unsafe');
  const siteCheckFailed = [...siteById.values()].some((r) => r.status === 'error');

  const runExposureCheck = useCallback(async () => {
    setChecking(true);
    try {
      const [results, sites] = await Promise.all([
        checkPwnedMany(entries.map((e) => e.password)),
        checkUrlsReputation(entries.map((e) => e.url).filter(Boolean)),
      ]);
      const byId = new Map<string, PwnedResult>();
      const siteMap = new Map<string, UrlReputation>();
      for (const e of entries) {
        const r = results.get(e.password);
        if (r) byId.set(e.id, r);
        const site = sites.get(e.url);
        if (site) siteMap.set(e.id, site);
      }
      setPwnedById(byId);
      setSiteById(siteMap);
    } finally {
      setChecking(false);
    }
  }, [entries]);

  const handleDelete = async (entry: VaultEntry) => {
    if (!window.confirm(`Excluir "${entry.title}"? Esta ação não pode ser desfeita.`)) return;
    setActionError('');
    try {
      await session.removeEntry(entry.id);
    } catch (err) {
      setActionError(friendlyError(err, 'Não foi possível excluir a credencial.'));
    }
  };

  if (!isSupabaseConfigured) {
    return (
      <CenterLayout>
        <h2>Configuração necessária</h2>
        <p className="muted">
          Defina <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> (veja <code>.env.example</code>) e
          reinicie a aplicação.
        </p>
      </CenterLayout>
    );
  }

  if (status !== 'unlocked') {
    const signOut = () => void session.signOut();
    return (
      <CenterLayout>
        {status === 'loading' && <p className="muted">Carregando…</p>}
        {status === 'signed-out' && <AuthScreen onSignIn={session.signIn} onSignUp={session.signUp} />}
        {status === 'load-error' && (
          <>
            <div>
              <p className="eyebrow">Algo deu errado</p>
              <h2>Não foi possível carregar o cofre</h2>
            </div>
            <div className="alert alert--error">{session.loadError}</div>
            <button type="button" className="btn btn--primary btn--block" onClick={session.retry}>
              Tentar novamente
            </button>
            <button type="button" className="btn btn--ghost btn--block" onClick={signOut}>
              Sair
            </button>
          </>
        )}
        {status === 'needs-mfa' && <MfaChallenge email={user?.email ?? ''} onVerify={session.verifyMfa} onSignOut={signOut} />}
        {(status === 'needs-setup' || status === 'locked') && (
          <VaultGate
            mode={status}
            email={user?.email ?? ''}
            onSetup={session.setupVault}
            onUnlock={session.unlock}
            hasRecovery={session.hasRecovery}
            onRecover={session.recover}
            onSignOut={signOut}
          />
        )}
      </CenterLayout>
    );
  }

  const weakCount = health.weak.length;
  const score =
    entries.length === 0
      ? null
      : Math.max(0, Math.round(((entries.length - weakCount - health.reused.length / 2 - exposedCount) / entries.length) * 100));
  const page = PAGE_TITLES[activeView] ?? PAGE_TITLES.dashboard;
  const pageLabel = NAV_ITEMS.find((n) => n.key === activeView)?.label;

  return (
    <div className="shell">
      <Sidebar activeView={activeView} onSelect={setActiveView} onLock={session.lock} onSignOut={() => void session.signOut()} />

      <main className="main">
        <header className="topbar">
          <label className="search">
            <Icon name="search" size={16} />
            <span className="sr-only">Buscar no cofre</span>
            <input
              type="search"
              placeholder="Buscar no cofre"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                if (activeView !== 'vault') setActiveView('vault');
              }}
            />
          </label>
          <div className="row">
            <span className="subtle">{user?.email}</span>
            <button type="button" className="btn btn--primary" onClick={() => setEditing('new')}>
              <Icon name="plus" />
              Nova credencial
            </button>
          </div>
        </header>

        <div className="page">
          <div className="page__header">
            <div>
              <p className="eyebrow">{pageLabel}</p>
              <h1>{page.title}</h1>
              <p className="muted">{page.subtitle}</p>
            </div>
          </div>

          {editing && (
            <EntryForm
              initial={editing === 'new' ? undefined : editing}
              onCancel={() => setEditing(null)}
              onSubmit={async (data) => {
                if (editing === 'new') await session.addEntry(data);
                else await session.editEntry(editing.id, data);
                setEditing(null);
              }}
            />
          )}

          {session.undecryptable > 0 && (
            <div className="alert alert--warn">
              {session.undecryptable} credencial(is) não puderam ser descriptografadas (corrompidas ou alteradas) e estão
              ocultas.
            </div>
          )}
          {actionError && <div className="alert alert--error">{actionError}</div>}

          {activeView === 'dashboard' && (
            <>
              <section className="grid grid--stats">
                <StatCard label="Credenciais" value={String(entries.length)} />
                <StatCard
                  label="Senhas fracas"
                  value={String(weakCount)}
                  note={entries.length ? (weakCount ? 'Corrigir' : 'OK') : undefined}
                  tone={weakCount ? 'bad' : 'good'}
                />
                <StatCard
                  label="Senhas reutilizadas"
                  value={String(health.reused.length)}
                  note={entries.length ? (health.reused.length ? 'Corrigir' : 'OK') : undefined}
                  tone={health.reused.length ? 'bad' : 'good'}
                />
                <StatCard
                  label="Vazadas em incidentes"
                  value={checkedCount ? String(exposedCount) : '—'}
                  note={checkedCount ? `${checkedCount} verificadas` : 'Não verificado'}
                  tone={checkedCount ? (exposedCount ? 'bad' : 'good') : 'neutral'}
                />
              </section>

              <section className="card">
                <div className="card__header">
                  <div>
                    <p className="eyebrow">Saúde das credenciais</p>
                    <h2>{score === null ? 'Sem dados ainda' : `${score}% saudável`}</h2>
                  </div>
                  <button type="button" className="btn btn--primary" onClick={runExposureCheck} disabled={checking || entries.length === 0}>
                    <Icon name="shield" />
                    {checking ? 'Verificando…' : 'Verificar segurança'}
                  </button>
                </div>
                {entries.length === 0 ? (
                  <p className="empty">Adicione credenciais para ver senhas fracas, reutilizadas e vazadas.</p>
                ) : (
                  <>
                    {score !== null && (
                      <div className={`meter ${score < 50 ? 'meter--danger' : score < 80 ? 'meter--warn' : ''}`} aria-hidden="true">
                        <span className={`w-${Math.round(score / 10)}`} />
                      </div>
                    )}
                    <p className="subtle">
                      Baseado nas suas {entries.length} credenciais. A verificação de vazamentos usa a API do Have I Been
                      Pwned com k-anonimato: só os 5 primeiros caracteres do hash SHA-1 de cada senha saem do seu
                      dispositivo. Os sites salvos são verificados no Google Safe Browsing.
                    </p>
                    {health.reusedGroups.length > 0 && (
                      <div className="alert alert--warn">
                        Senhas reutilizadas:{' '}
                        {health.reusedGroups
                          .map((group) => group.map((id) => entries.find((e) => e.id === id)?.title ?? '?').join(' = '))
                          .join('; ')}
                      </div>
                    )}
                    {unsafeSites.length > 0 && (
                      <div className="alert alert--error">
                        Site(s) marcado(s) como perigoso(s) pelo Google Safe Browsing: {unsafeSites.map((e) => e.title).join(', ')}.
                        Não entre nesses sites; revise essas credenciais.
                      </div>
                    )}
                    {siteCheckFailed && (
                      <div className="alert">Não foi possível verificar a reputação de alguns sites (serviço indisponível).</div>
                    )}
                    {exposedCount > 0 && (
                      <div className="alert alert--error">
                        {exposedCount} senha(s) aparecem em vazamentos conhecidos. Troque-as no site de origem.
                      </div>
                    )}
                  </>
                )}
              </section>

              <PasswordTable
                title="Credenciais recentes"
                items={entries.slice(0, 5)}
                strengthById={strengthById}
                reusedIds={reusedIds}
                pwnedById={pwnedById}
                siteById={siteById}
                onAdd={() => setEditing('new')}
                onEdit={setEditing}
                onDelete={handleDelete}
              />
            </>
          )}

          {activeView === 'vault' && (
            <PasswordTable
              items={filtered}
              strengthById={strengthById}
              reusedIds={reusedIds}
              pwnedById={pwnedById}
              siteById={siteById}
              onAdd={() => setEditing('new')}
              onEdit={setEditing}
              onDelete={handleDelete}
            />
          )}

          {activeView === 'files' && <FilesView getKeyContext={session.getKeyContext} getKeyPair={session.getKeyPair} />}

          {activeView === 'generator' && <Generator />}

          {activeView === 'activity' && <ActivityView />}

          {activeView === 'settings' && (
            <Settings
              email={user?.email ?? ''}
              idleMinutes={IDLE_LOCK_MS / 60000}
              onChangePassword={session.changePassword}
              onLock={session.lock}
              recoveryEnabled={session.hasRecovery}
              onEnableRecovery={session.enableRecovery}
              onDisableRecovery={session.disableRecovery}
            />
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
