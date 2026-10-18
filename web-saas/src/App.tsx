import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityView } from './components/ActivityView';
import { AdminView } from './components/AdminView';
import { DiagnosticsCard } from './components/DiagnosticsCard';
import { AuthScreen } from './components/AuthScreen';
import { FilesView } from './components/FilesView';
import { Generator } from './components/Generator';
import { ItemEditor } from './components/ItemEditor';
import { ItemList } from './components/ItemList';
import { ItemShareDialog } from './components/ItemShareDialog';
import { MfaChallenge } from './components/MfaChallenge';
import { PostureCard } from './components/PostureCard';
import { Settings } from './components/Settings';
import { ADMIN_ITEM, NAV_ITEMS, Sidebar } from './components/Sidebar';
import { StatCard } from './components/StatCard';
import { TransferDownload } from './components/TransferDownload';
import { VaultGate } from './components/VaultGate';
import { VaultView } from './components/VaultView';
import { CenterLayout } from './components/ui/CenterLayout';
import { Icon } from './components/ui/Icon';
import { checkPwnedMany, type PwnedResult } from './lib/health/pwned';
import { computeItemHealth } from './lib/itemHealth';
import { type ItemType, hasCheckablePassword } from './lib/items';
import { friendlyError } from './lib/messages';
import { type PostureInput, computePosture } from './lib/posture';
import { isSupabaseConfigured } from './lib/supabase';
import { FREE_LIMITS, type PlanLimits, deleteFileById, fetchPlanLimits } from './services/fileService';
import { type AdminStatus, fetchAdminStatus } from './services/adminService';
import { listVerifiedTotpFactors } from './services/mfaService';
import { fetchSessions, fetchSharingExposure } from './services/postureService';
import { checkUrlsReputation, type UrlReputation } from './services/urlReputation';
import { IDLE_LOCK_MS, type VaultItem, useVaultSession } from './state/useVaultSession';

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
  vault: { title: 'Cofre', subtitle: 'Logins, notas seguras, segredos e cartões criptografados no seu dispositivo.' },
  files: { title: 'Arquivos', subtitle: 'Arquivos, compartilhamentos e transferências temporárias.' },
  generator: { title: 'Gerador', subtitle: 'Senhas fortes geradas no navegador.' },
  activity: { title: 'Atividade', subtitle: 'Log de auditoria da sua conta.' },
  settings: { title: 'Configurações', subtitle: 'Segurança da conta, recuperação, sessões e diagnóstico.' },
  admin: { title: 'Administração', subtitle: 'Operação da plataforma: usuários, sinais e saúde do sistema.' },
};

type Editing = { item?: VaultItem; type?: ItemType } | null;

function VaultApp() {
  const session = useVaultSession();
  const { status, user, items } = session;
  const [activeView, setActiveView] = useState('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [editing, setEditing] = useState<Editing>(null);
  const [sharingItem, setSharingItem] = useState<VaultItem | null>(null);
  const [actionError, setActionError] = useState('');
  const [pwnedById, setPwnedById] = useState<Map<string, PwnedResult>>(new Map());
  const [siteById, setSiteById] = useState<Map<string, UrlReputation>>(new Map());
  const [checking, setChecking] = useState(false);
  const [limits, setLimits] = useState<PlanLimits>(FREE_LIMITS);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [sessionCount, setSessionCount] = useState(1);
  const [exposure, setExposure] = useState<PostureInput['exposure']>(null);
  const [securityCheckRan, setSecurityCheckRan] = useState(false);
  const [vaultFilter, setVaultFilter] = useState<{ value?: string; key: number }>({ key: 0 });

  const [adminStatus, setAdminStatus] = useState<AdminStatus>(null);

  useEffect(() => {
    if (status !== 'unlocked') return;
    void fetchPlanLimits().then(setLimits);
    void fetchAdminStatus().then(setAdminStatus);
  }, [status]);

  // Posture inputs: refreshed when the dashboard is shown.
  useEffect(() => {
    if (status !== 'unlocked' || activeView !== 'dashboard') return;
    void listVerifiedTotpFactors()
      .then((f) => setMfaEnabled(f.some((x) => x.status === 'verified')))
      .catch(() => undefined);
    void fetchSessions()
      .then((s) => setSessionCount(s.length))
      .catch(() => undefined);
    void fetchSharingExposure().then(setExposure);
  }, [status, activeView, items]);

  const health = useMemo(() => computeItemHealth(items, pwnedById, siteById), [items, pwnedById, siteById]);

  const runSecurityCheck = useCallback(async () => {
    setChecking(true);
    try {
      const checkable = items.filter((i) => hasCheckablePassword(i.data));
      const [results, sites] = await Promise.all([
        checkPwnedMany(checkable.map((i) => i.data.password)),
        checkUrlsReputation(items.map((i) => i.data.url).filter(Boolean)),
      ]);
      const byId = new Map<string, PwnedResult>();
      const siteMap = new Map<string, UrlReputation>();
      for (const i of items) {
        const r = hasCheckablePassword(i.data) ? results.get(i.data.password) : undefined;
        if (r) byId.set(i.id, r);
        const site = sites.get(i.data.url);
        if (site) siteMap.set(i.id, site);
      }
      setPwnedById(byId);
      setSiteById(siteMap);
      setSecurityCheckRan(true);
    } finally {
      setChecking(false);
    }
  }, [items]);

  const handleDelete = async (item: VaultItem) => {
    setActionError('');
    try {
      if (item.access !== 'owner') {
        if (!window.confirm(`Remover "${item.data.title}" da sua lista? Você perde o acesso a este item compartilhado.`)) return;
        await session.leaveSharedItem(item);
        return;
      }
      if (!window.confirm(`Excluir "${item.data.title}"? Esta ação não pode ser desfeita.`)) return;
      const alsoFiles =
        item.data.attachments.length > 0 &&
        window.confirm(`Excluir também os ${item.data.attachments.length} anexo(s) deste item? (Cancelar mantém os arquivos em Arquivos.)`);
      await session.removeItem(item);
      if (alsoFiles) for (const a of item.data.attachments) await deleteFileById(a.fileId).catch(() => undefined);
    } catch (err) {
      setActionError(friendlyError(err, 'Não foi possível excluir o item.'));
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

  const checkable = health.checkable;
  const checkedCount = [...pwnedById.values()].filter((r) => r.status === 'ok').length;
  const siteCheckFailed = [...siteById.values()].some((r) => r.status === 'error');
  const penalty = health.counts.weak + health.counts.reused / 2 + health.counts.exposed;
  const score = checkable === 0 ? null : Math.max(0, Math.round(((checkable - penalty) / checkable) * 100));
  const page = PAGE_TITLES[activeView] ?? PAGE_TITLES.dashboard;
  const pageLabel = [...NAV_ITEMS, ADMIN_ITEM].find((n) => n.key === activeView)?.label;
  const titleOf = (id: string) => items.find((i) => i.id === id)?.data.title ?? '?';
  const recent = [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);
  const posture = computePosture({
    checkable,
    weak: health.counts.weak,
    reused: health.counts.reused,
    exposed: health.counts.exposed,
    stale: health.counts.stale,
    unsafeSites: health.counts.unsafe,
    securityCheckRan,
    mfaEnabled,
    recoveryEnabled: session.hasRecovery,
    sessions: sessionCount,
    exposure,
  });
  const goTo = (view: string, filter?: string) => {
    if (view === 'dashboard' && !filter) {
      void runSecurityCheck();
      return;
    }
    if (view === 'vault') setVaultFilter((f) => ({ value: filter, key: f.key + 1 }));
    setActiveView(view);
  };

  return (
    <div className="shell">
      <Sidebar
        activeView={activeView}
        onSelect={setActiveView}
        onLock={session.lock}
        onSignOut={() => void session.signOut()}
        showAdmin={Boolean(adminStatus)}
      />

      <main className="main">
        <header className="topbar">
          <label className="search">
            <Icon name="search" size={16} />
            <span className="sr-only">Buscar no cofre</span>
            <input
              type="search"
              placeholder="Buscar no cofre (título, usuário, tags, campos)"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                if (activeView !== 'vault') setActiveView('vault');
              }}
            />
          </label>
          <div className="row">
            <span className="subtle">{user?.email}</span>
            <button type="button" className="btn btn--primary" onClick={() => setEditing({})}>
              <Icon name="plus" />
              Novo item
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
            <ItemEditor
              item={editing.item}
              initialType={editing.type}
              folders={session.folders}
              getKeyContext={session.getKeyContext}
              getKeyPair={session.getKeyPair}
              getHistory={session.getHistory}
              onCancel={() => setEditing(null)}
              onSave={async (data) => {
                if (editing.item) await session.saveItem(editing.item, data);
                else await session.addItem(data);
                setEditing(null);
              }}
            />
          )}

          {sharingItem && (
            <ItemShareDialog
              item={items.find((i) => i.id === sharingItem.id) ?? sharingItem}
              limits={limits}
              onClose={() => setSharingItem(null)}
              onShare={async (recipient, permission, expiresAt) => {
                const current = items.find((i) => i.id === sharingItem.id) ?? sharingItem;
                await session.shareItem(current, recipient, permission, expiresAt);
              }}
              onRevoke={async (share) => {
                const current = items.find((i) => i.id === sharingItem.id) ?? sharingItem;
                await session.revokeItemShare(current, share);
              }}
              onSetPermission={async (share, permission) => {
                const current = items.find((i) => i.id === sharingItem.id) ?? sharingItem;
                await session.setSharePermission(current, share, permission);
              }}
            />
          )}

          {session.undecryptable > 0 && (
            <div className="alert alert--warn">
              {session.undecryptable} item(ns) não puderam ser descriptografados (corrompidos, alterados ou com acesso
              expirado) e estão ocultos.
            </div>
          )}
          {actionError && <div className="alert alert--error">{actionError}</div>}

          {activeView === 'dashboard' && (
            <>
              <PostureCard posture={posture} onAction={goTo} />

              <section className="grid grid--stats">
                <StatCard label="Itens no cofre" value={String(items.length)} />
                <StatCard
                  label="Senhas fracas"
                  value={String(health.counts.weak)}
                  note={checkable ? (health.counts.weak ? 'Corrigir' : 'OK') : undefined}
                  tone={health.counts.weak ? 'bad' : 'good'}
                />
                <StatCard
                  label="Senhas reutilizadas"
                  value={String(health.counts.reused)}
                  note={checkable ? (health.counts.reused ? 'Corrigir' : 'OK') : undefined}
                  tone={health.counts.reused ? 'bad' : 'good'}
                />
                <StatCard
                  label="Vazadas em incidentes"
                  value={checkedCount ? String(health.counts.exposed) : '—'}
                  note={checkedCount ? `${checkedCount} verificadas` : 'Não verificado'}
                  tone={checkedCount ? (health.counts.exposed ? 'bad' : 'good') : 'neutral'}
                />
              </section>

              <section className="card">
                <div className="card__header">
                  <div>
                    <p className="eyebrow">Saúde das senhas</p>
                    <h2>{score === null ? 'Sem logins ainda' : `${score}% saudável`}</h2>
                  </div>
                  <button type="button" className="btn btn--primary" onClick={runSecurityCheck} disabled={checking || items.length === 0}>
                    <Icon name="shield" />
                    {checking ? 'Verificando…' : 'Verificar segurança'}
                  </button>
                </div>
                {checkable === 0 ? (
                  <p className="empty">Adicione logins para ver senhas fracas, reutilizadas e vazadas.</p>
                ) : (
                  <>
                    {score !== null && (
                      <div className={`meter ${score < 50 ? 'meter--danger' : score < 80 ? 'meter--warn' : ''}`} aria-hidden="true">
                        <span className={`w-${Math.round(score / 10)}`} />
                      </div>
                    )}
                    <p className="subtle">
                      Baseado em {checkable} login(s). A verificação de vazamentos usa a API do Have I Been Pwned com
                      k-anonimato (só os 5 primeiros caracteres do hash SHA-1 saem do dispositivo). Os sites são verificados no
                      Google Safe Browsing.
                    </p>
                    {health.reusedGroups.length > 0 && (
                      <div className="alert alert--warn">
                        Senhas reutilizadas: {health.reusedGroups.map((g) => g.map(titleOf).join(' = ')).join('; ')}
                      </div>
                    )}
                    {health.counts.unsafe > 0 && (
                      <div className="alert alert--error">
                        {health.counts.unsafe} site(s) marcado(s) como perigoso(s) pelo Google Safe Browsing. Filtre por risco no
                        Cofre para revisar.
                      </div>
                    )}
                    {siteCheckFailed && <div className="alert">Não foi possível verificar a reputação de alguns sites (serviço indisponível).</div>}
                    {health.counts.exposed > 0 && (
                      <div className="alert alert--error">{health.counts.exposed} senha(s) aparecem em vazamentos conhecidos. Troque-as no site de origem.</div>
                    )}
                    {health.counts.stale > 0 && (
                      <div className="alert alert--warn">{health.counts.stale} senha(s) não são trocadas há mais de 1 ano.</div>
                    )}
                  </>
                )}
              </section>

              <ItemList
                title="Alterados recentemente"
                items={recent}
                health={health}
                emptyText="Nenhum item ainda."
                onNew={() => setEditing({})}
                onOpen={(item) => setEditing({ item })}
                onShare={setSharingItem}
                onDelete={handleDelete}
              />
            </>
          )}

          {activeView === 'vault' && (
            <VaultView
              key={vaultFilter.key}
              initialFilter={vaultFilter.value}
              items={items}
              folders={session.folders}
              health={health}
              query={searchTerm}
              onNew={(type) => setEditing({ type })}
              onOpen={(item) => setEditing({ item })}
              onShare={setSharingItem}
              onDelete={handleDelete}
              onCreateFolder={session.createFolder}
              onRenameFolder={session.renameFolder}
              onDeleteFolder={session.deleteFolder}
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
          {activeView === 'settings' && (
            <DiagnosticsCard
              getKeyContext={session.getKeyContext}
              getKeyPair={session.getKeyPair}
              itemCount={items.length}
              undecryptable={session.undecryptable}
            />
          )}

          {activeView === 'admin' && adminStatus && <AdminView status={adminStatus} />}
        </div>
      </main>
    </div>
  );
}

export default App;
