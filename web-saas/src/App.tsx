import { useCallback, useMemo, useState } from 'react';
import './App.css';
import { ActivityView } from './components/ActivityView';
import { AuthScreen } from './components/AuthScreen';
import { EntryForm } from './components/EntryForm';
import { FilesView } from './components/FilesView';
import { Generator } from './components/Generator';
import { MfaChallenge } from './components/MfaChallenge';
import { PasswordTable } from './components/PasswordTable';
import { Settings } from './components/Settings';
import { Sidebar } from './components/Sidebar';
import { StatCard } from './components/StatCard';
import { TransferDownload } from './components/TransferDownload';
import { VaultGate } from './components/VaultGate';
import { analyzeHealth, passwordStrength, type Strength } from './lib/health/passwordHealth';
import { checkPwnedMany, type PwnedResult } from './lib/health/pwned';
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
      [e.title, e.username, e.url, e.category].some((field) => field.toLowerCase().includes(term)),
    );
  }, [entries, searchTerm]);

  const exposedCount = useMemo(
    () => entries.filter((e) => {
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
    if (!window.confirm(`Delete "${entry.title}"? This cannot be undone.`)) return;
    setActionError('');
    try {
      await session.removeEntry(entry.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to delete the entry.');
    }
  };

  if (!isSupabaseConfigured) {
    return (
      <div className="app-shell">
        <main className="main-panel auth-panel">
          <section className="page-panel auth-box">
            <h3>Configuration required</h3>
            <p>
              Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> (see <code>.env.example</code>)
              and restart.
            </p>
          </section>
        </main>
      </div>
    );
  }

  if (status !== 'unlocked') {
    return (
      <div className="app-shell">
        <main className="main-panel auth-panel">
          <header className="topbar">
            <div>
              <p className="eyebrow">Welcome</p>
              <h1>SecureLink Vault</h1>
            </div>
          </header>
          {status === 'loading' && <p className="subheadline">Loading…</p>}
          {status === 'signed-out' && <AuthScreen onSignIn={session.signIn} onSignUp={session.signUp} />}
          {status === 'load-error' && (
            <section className="page-panel auth-box">
              <p className="eyebrow">Something went wrong</p>
              <h3>Could not load your vault</h3>
              <div className="form-error">{session.loadError}</div>
              <div className="form-actions">
                <button type="button" className="primary-button" onClick={session.retry}>
                  Try again
                </button>
                <button type="button" className="ghost-button" onClick={() => void session.signOut()}>
                  Sign out
                </button>
              </div>
            </section>
          )}
          {status === 'needs-mfa' && (
            <MfaChallenge email={user?.email ?? ''} onVerify={session.verifyMfa} onSignOut={() => void session.signOut()} />
          )}
          {(status === 'needs-setup' || status === 'locked') && (
            <VaultGate
              mode={status}
              email={user?.email ?? ''}
              onSetup={session.setupVault}
              onUnlock={session.unlock}
              hasRecovery={session.hasRecovery}
              onRecover={session.recover}
              onSignOut={() => void session.signOut()}
            />
          )}
        </main>
      </div>
    );
  }

  const weakCount = health.weak.length;
  const score = entries.length === 0 ? null : Math.round(((entries.length - weakCount - health.reused.length / 2 - exposedCount) / entries.length) * 100);

  return (
    <div className="app-shell">
      <Sidebar activeView={activeView} onSelect={setActiveView} />

      <main className="main-panel">
        <header className="topbar">
          <div>
            <p className="eyebrow">Workspace</p>
            <h1>Your vault</h1>
            <p className="subheadline">{user?.email}</p>
          </div>

          <div className="topbar-actions">
            <label className="search-box" aria-label="Search vault">
              <span>⌕</span>
              <input
                type="text"
                placeholder="Search vault"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  if (activeView !== 'vault') setActiveView('vault');
                }}
              />
            </label>
            <button type="button" className="ghost-button" onClick={session.lock}>
              Lock
            </button>
            <button type="button" className="ghost-button" onClick={() => void session.signOut()}>
              Sign out
            </button>
            <button type="button" className="primary-button" onClick={() => setEditing('new')}>
              + New entry
            </button>
          </div>
        </header>

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
          <div className="notice warning">
            {session.undecryptable} entr{session.undecryptable === 1 ? 'y' : 'ies'} could not be decrypted
            (corrupted or modified) and {session.undecryptable === 1 ? 'is' : 'are'} hidden.
          </div>
        )}
        {actionError && <div className="form-error">{actionError}</div>}

        {activeView === 'dashboard' && (
          <>
            <section className="stats-grid">
              <StatCard label="Entries" value={String(entries.length)} />
              <StatCard
                label="Weak passwords"
                value={String(weakCount)}
                note={entries.length ? (weakCount ? 'Fix' : 'OK') : undefined}
                tone={weakCount ? 'bad' : 'good'}
              />
              <StatCard
                label="Reused passwords"
                value={String(health.reused.length)}
                note={entries.length ? (health.reused.length ? 'Fix' : 'OK') : undefined}
                tone={health.reused.length ? 'bad' : 'good'}
              />
              <StatCard
                label="Exposed in breaches"
                value={checkedCount ? String(exposedCount) : '—'}
                note={checkedCount ? `${checkedCount} checked` : 'Not checked'}
                tone={checkedCount ? (exposedCount ? 'bad' : 'good') : 'neutral'}
              />
            </section>

            <section className="content-grid">
              <div className="panel large-panel">
                <div className="panel-head">
                  <div>
                    <p className="eyebrow">Credential health</p>
                    <h3>{score === null ? 'No data yet' : `${Math.max(score, 0)}% healthy`}</h3>
                  </div>
                  <button type="button" className="primary-button" onClick={runExposureCheck} disabled={checking || entries.length === 0}>
                    {checking ? 'Checking…' : 'Run security check'}
                  </button>
                </div>
                {entries.length === 0 ? (
                  <p className="empty-state">Add entries to see weak, reused and exposed passwords.</p>
                ) : (
                  <>
                    <p>
                      Based on your {entries.length} stored credentials. Breach exposure uses the Have I Been Pwned
                      range API: only the first 5 characters of each password's SHA-1 hash leave your device. Saved
                      sites are checked against Google Safe Browsing.
                    </p>
                    {health.reusedGroups.length > 0 && (
                      <div className="notice warning">
                        Reused: {health.reusedGroups
                          .map((group) => group.map((id) => entries.find((e) => e.id === id)?.title ?? '?').join(' = '))
                          .join('; ')}
                      </div>
                    )}
                    {unsafeSites.length > 0 && (
                      <div className="notice warning">
                        Dangerous site{unsafeSites.length === 1 ? '' : 's'} flagged by Google Safe Browsing:{' '}
                        {unsafeSites.map((e) => e.title).join(', ')}. Do not sign in there; review these entries.
                      </div>
                    )}
                    {siteCheckFailed && (
                      <div className="notice">Site reputation could not be checked for some entries (service unavailable).</div>
                    )}
                    {exposedCount > 0 && (
                      <div className="notice warning">
                        {exposedCount} password{exposedCount === 1 ? ' appears' : 's appear'} in known data breaches.
                        Change {exposedCount === 1 ? 'it' : 'them'} on the original site.
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>

            <section className="bottom-grid">
              <PasswordTable
                items={entries.slice(0, 5)}
                strengthById={strengthById}
                reusedIds={reusedIds}
                pwnedById={pwnedById}
                siteById={siteById}
                onAdd={() => setEditing('new')}
                onEdit={setEditing}
                onDelete={handleDelete}
              />
            </section>
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
      </main>
    </div>
  );
}

export default App;
