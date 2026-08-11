import { type FormEvent, useEffect, useMemo, useState } from 'react';
import './App.css';
import { PasswordTable } from './components/PasswordTable';
import { Sidebar } from './components/Sidebar';
import { StatCard } from './components/StatCard';
import {
  activityFeed,
  overviewStats,
  planFeatures,
  secureLinks as defaultSecureLinks,
  scoreBreakdown,
  type SecureLink,
  type VaultItem,
  vaultItems as defaultVaultItems,
} from './data/mockData';
import {
  createSecureLink,
  createVaultItem,
  fetchSecureLinks,
  fetchVaultItems,
  getSession,
  onAuthStateChange,
  signIn,
  signOut,
  signUp,
} from './services/supabaseService';

function App() {
  const [activeView, setActiveView] = useState('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [passwordLength, setPasswordLength] = useState(18);
  const [useUppercase, setUseUppercase] = useState(true);
  const [useNumbers, setUseNumbers] = useState(true);
  const [useSymbols, setUseSymbols] = useState(true);
  const [vaultItemsState, setVaultItemsState] = useState<VaultItem[]>(defaultVaultItems);
  const [secureLinksState, setSecureLinksState] = useState<SecureLink[]>(defaultSecureLinks);
  const [isAddSecretOpen, setIsAddSecretOpen] = useState(false);
  const [newSecret, setNewSecret] = useState({
    title: '',
    username: '',
    password: '',
    url: '',
    appLink: '',
    category: 'Work',
  });
  const [newSecureLink, setNewSecureLink] = useState({
    title: '',
    url: '',
    description: '',
    status: 'Trusted',
  });
  const [user, setUser] = useState<any>(null);
  const [authMode, setAuthMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [linkError, setLinkError] = useState('');
  const [authForm, setAuthForm] = useState({ email: '', password: '' });

  const loadUserData = async (userId: string) => {
    const [vaultResponse, secureLinkResponse] = await Promise.all([
      fetchVaultItems(userId),
      fetchSecureLinks(userId),
    ]);

    if (vaultResponse.error) {
      console.error('Vault fetch error', String(vaultResponse.error));
    } else if (vaultResponse.data) {
      setVaultItemsState(vaultResponse.data);
    }

    if (secureLinkResponse.error) {
      console.error('Secure links fetch error', String(secureLinkResponse.error));
    } else if (secureLinkResponse.data) {
      setSecureLinksState(secureLinkResponse.data);
    }
  };

  useEffect(() => {
    const initializeSession = async () => {
      const sessionResult = await getSession();
      const sessionUser = sessionResult.data?.session?.user ?? null;
      setUser(sessionUser);
      if (sessionUser) {
        await loadUserData(sessionUser.id);
      }
    };

    initializeSession();

    const { data: listener } = onAuthStateChange(async (_event, session) => {
      const sessionUser = session?.user ?? null;
      setUser(sessionUser);
      if (sessionUser) {
        await loadUserData(sessionUser.id);
      } else {
        setVaultItemsState([]);
        setSecureLinksState([]);
      }
    });

    return () => listener?.subscription?.unsubscribe();
  }, []);

  const filteredVault = useMemo(
    () =>
      vaultItemsState.filter((item) =>
        item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.url.toLowerCase().includes(searchTerm.toLowerCase()),
      ),
    [searchTerm, vaultItemsState],
  );

  const generatedPassword = useMemo(() => {
    const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '123456789';
    const symbols = '!@#$%^&*()_+-=[]{}';
    const alphabet =
      lowercase +
      (useUppercase ? uppercase : '') +
      (useNumbers ? numbers : '') +
      (useSymbols ? symbols : '');

    if (!alphabet) {
      return 'Select at least one character set';
    }

    const values = new Uint32Array(passwordLength);
    const cryptoSource = typeof globalThis.crypto !== 'undefined' ? globalThis.crypto : undefined;

    if (cryptoSource && typeof cryptoSource.getRandomValues === 'function') {
      cryptoSource.getRandomValues(values);
    } else {
      for (let i = 0; i < passwordLength; i += 1) {
        values[i] = Math.floor(Math.random() * 0xffffffff);
      }
    }

    let password = '';
    for (let i = 0; i < passwordLength; i += 1) {
      password += alphabet[values[i] % alphabet.length];
    }

    return password;
  }, [passwordLength, useNumbers, useSymbols, useUppercase]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedPassword);
    } catch {
      // no-op for demo behavior
    }
  };

  const calculateStrength = (password: string) => {
    if (!password) {
      return 'Weak';
    }

    const hasUpper = /[A-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSymbol = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);

    if (password.length >= 16 && hasUpper && hasNumber && hasSymbol) {
      return 'Strong';
    }

    if (password.length >= 10 && (hasUpper || hasNumber || hasSymbol)) {
      return 'Medium';
    }

    return 'Weak';
  };

  const handleCreateSecret = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) {
      setSaveError('Please sign in to save secrets.');
      return;
    }

    const item = {
      title: newSecret.title || 'Untitled secret',
      username: newSecret.username || 'unknown',
      password: newSecret.password || '',
      url: newSecret.url || 'example.com',
      app_link: newSecret.appLink || null,
      category: newSecret.category as 'Work' | 'Finance' | 'Social' | 'Personal',
      strength: calculateStrength(newSecret.password) as 'Strong' | 'Medium' | 'Weak',
      last_used: 'Just now',
      status: 'Healthy' as const,
      exposed: false,
      user_id: user.id,
    };

    const result = await createVaultItem(item as any);
    if (result.error) {
      setSaveError(result.error ? String(result.error) : 'Unable to save secret.');
      return;
    }

    const savedItem = result.data ?? {
      id: vaultItemsState.length > 0 ? Math.max(...vaultItemsState.map((entry) => entry.id)) + 1 : 1,
      title: item.title,
      username: item.username,
      password: item.password,
      url: item.url,
      appLink: item.app_link ?? undefined,
      category: item.category,
      strength: item.strength,
      lastUsed: item.last_used,
      status: item.status,
      exposed: item.exposed,
    };

    setVaultItemsState((current) => [savedItem as VaultItem, ...current]);
    setIsAddSecretOpen(false);
    setNewSecret({ title: '', username: '', password: '', url: '', appLink: '', category: 'Work' });
  };

  const handleAddSecureLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) {
      setAuthError('Please sign in to save secure links.');
      return;
    }

    const secureLink = {
      title: newSecureLink.title || 'New secure link',
      url: newSecureLink.url || 'https://example.com',
      description: newSecureLink.description || 'No description provided',
      status: newSecureLink.status as 'Trusted' | 'Review',
      user_id: user.id,
    };

    const result = await createSecureLink(secureLink as any);
    if (result.error) {
      setLinkError(result.error ? String(result.error) : 'Unable to save secure link.');
      return;
    }

    const savedLink = result.data ?? {
      id: secureLinksState.length > 0 ? Math.max(...secureLinksState.map((link) => link.id)) + 1 : 1,
      ...secureLink,
    };

    setSecureLinksState((current) => [savedLink as SecureLink, ...current]);
    setNewSecureLink({ title: '', url: '', description: '', status: 'Trusted' });
  };

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError('');
    setAuthLoading(true);

    try {
      const result = authMode === 'sign-up'
        ? await signUp(authForm.email, authForm.password)
        : await signIn(authForm.email, authForm.password);

      if (result.error) {
        setAuthError(result.error.message);
        return;
      }

      const authenticatedUser = result.data?.user ?? result.data?.session?.user ?? null;
      if (authenticatedUser) {
        setUser(authenticatedUser);
        await loadUserData(authenticatedUser.id);
      }
    } catch (error) {
      setAuthError('Unable to authenticate. Please try again.');
      console.error(error);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    setUser(null);
    setVaultItemsState([]);
    setSecureLinksState([]);
  };

  if (!user) {
    return (
      <div className="app-shell">
        <Sidebar activeView={activeView} onSelect={setActiveView} />
        <main className="main-panel auth-panel">
          <header className="topbar">
            <div>
              <p className="eyebrow">Welcome</p>
              <h1>Secure Vault SaaS</h1>
            </div>
          </header>

          <section className="page-panel auth-box">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Authentication</p>
                <h3>{authMode === 'sign-in' ? 'Sign in' : 'Create your account'}</h3>
              </div>
            </div>

            <form className="form-grid" onSubmit={handleAuthSubmit}>
              <label>
                Email
                <input
                  type="email"
                  value={authForm.email}
                  onChange={(event) => setAuthForm((prev) => ({ ...prev, email: event.target.value }))}
                  placeholder="you@example.com"
                  required
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={authForm.password}
                  onChange={(event) => setAuthForm((prev) => ({ ...prev, password: event.target.value }))}
                  placeholder="Create a password"
                  required
                />
              </label>
              {authError && <div className="form-error">{authError}</div>}
              <div className="form-actions">
                <button type="submit" className="primary-button" disabled={authLoading}>
                  {authMode === 'sign-in' ? 'Sign in' : 'Sign up'}
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setAuthMode((prev) => (prev === 'sign-in' ? 'sign-up' : 'sign-in'))}
                >
                  {authMode === 'sign-in' ? 'Create account' : 'Already have an account?'}
                </button>
              </div>
            </form>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar activeView={activeView} onSelect={setActiveView} />

      <main className="main-panel">
        <header className="topbar">
          <div>
            <p className="eyebrow">Workspace</p>
            <h1>Security operations</h1>
            <p className="subheadline">Olá, {user.email}</p>
          </div>

          <div className="topbar-actions">
            <label className="search-box" aria-label="Search vault">
              <span>⌕</span>
              <input
                type="text"
                placeholder="Search vault"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </label>

            <button type="button" className="ghost-button" onClick={handleSignOut}>
              Sign out
            </button>

            <button type="button" className="primary-button" onClick={() => setIsAddSecretOpen(true)}>
              + New secret
            </button>
          </div>
        </header>

        {isAddSecretOpen && (
          <div className="modal-backdrop" role="dialog" aria-modal="true">
            <div className="modal" onClick={(event) => event.stopPropagation()}>
              <div className="modal-head">
                <div>
                  <p className="eyebrow">New secret</p>
                  <h3>Add a secure credential</h3>
                </div>
                <button type="button" className="ghost-button" onClick={() => setIsAddSecretOpen(false)}>
                  Close
                </button>
              </div>
              <form className="form-grid" onSubmit={handleCreateSecret}>
                <label>
                  Title
                  <input
                    value={newSecret.title}
                    onChange={(event) => setNewSecret((prev) => ({ ...prev, title: event.target.value }))}
                    placeholder="Secret name"
                    required
                  />
                </label>
                <label>
                  Username
                  <input
                    value={newSecret.username}
                    onChange={(event) => setNewSecret((prev) => ({ ...prev, username: event.target.value }))}
                    placeholder="Username or email"
                    required
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    value={newSecret.password}
                    onChange={(event) => setNewSecret((prev) => ({ ...prev, password: event.target.value }))}
                    placeholder="Enter password"
                    required
                  />
                </label>
                <label>
                  Related site
                  <input
                    value={newSecret.url}
                    onChange={(event) => setNewSecret((prev) => ({ ...prev, url: event.target.value }))}
                    placeholder="example.com"
                    required
                  />
                </label>
                <label>
                  App link
                  <input
                    value={newSecret.appLink}
                    onChange={(event) => setNewSecret((prev) => ({ ...prev, appLink: event.target.value }))}
                    placeholder="https://app.example.com"
                  />
                </label>
                <label>
                  Category
                  <select
                    value={newSecret.category}
                    onChange={(event) => setNewSecret((prev) => ({ ...prev, category: event.target.value as any }))}
                  >
                    <option value="Work">Work</option>
                    <option value="Finance">Finance</option>
                    <option value="Social">Social</option>
                    <option value="Personal">Personal</option>
                  </select>
                </label>
                {saveError && <div className="form-error">{saveError}</div>}
                <div className="form-actions">
                  <button type="submit" className="primary-button">
                    Save secret
                  </button>
                  <button type="button" className="ghost-button" onClick={() => setIsAddSecretOpen(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {activeView === 'dashboard' && (
          <>
            <section className="stats-grid">
              {overviewStats.map((stat) => (
                <StatCard
                  key={stat.label}
                  label={stat.label}
                  value={stat.value}
                  change={stat.change}
                  status={stat.status === 'up' ? 'up' : 'down'}
                />
              ))}
            </section>

            <section className="content-grid">
              <div className="panel large-panel">
                <div className="panel-head">
                  <div>
                    <p className="eyebrow">Threat overview</p>
                    <h3>Security score</h3>
                  </div>
                  <span className="mini-tag success">Healthy</span>
                </div>

                <div className="score-ring-wrap">
                  <div className="score-ring">
                    <span>94%</span>
                  </div>
                </div>

                <div className="score-list">
                  {scoreBreakdown.map((item) => (
                    <div key={item.label} className="score-item">
                      <div className="score-label-row">
                        <span>{item.label}</span>
                        <span>{item.value}%</span>
                      </div>
                      <div className="progress-bar">
                        <span style={{ width: `${item.value}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="panel generator-panel">
                <div className="panel-head">
                  <div>
                    <p className="eyebrow">Generator</p>
                    <h3>Password builder</h3>
                  </div>
                </div>

                <div className="password-output">
                  <span>{generatedPassword}</span>
                  <button type="button" onClick={handleCopy}>Copy</button>
                </div>

                <label className="range-row">
                  <span>Length</span>
                  <strong>{passwordLength}</strong>
                </label>
                <input
                  type="range"
                  min="8"
                  max="28"
                  value={passwordLength}
                  onChange={(event) => setPasswordLength(Number(event.target.value))}
                />

                <div className="toggle-list">
                  <label>
                    <input type="checkbox" checked={useUppercase} onChange={() => setUseUppercase((prev) => !prev)} />
                    Uppercase
                  </label>
                  <label>
                    <input type="checkbox" checked={useNumbers} onChange={() => setUseNumbers((prev) => !prev)} />
                    Numbers
                  </label>
                  <label>
                    <input type="checkbox" checked={useSymbols} onChange={() => setUseSymbols((prev) => !prev)} />
                    Symbols
                  </label>
                </div>
              </div>
            </section>

            <section className="bottom-grid">
              <PasswordTable items={filteredVault} onAddItem={() => setIsAddSecretOpen(true)} />

              <div className="panel activity-panel">
                <div className="panel-head">
                  <div>
                    <p className="eyebrow">Activity</p>
                    <h3>Recent actions</h3>
                  </div>
                </div>

                <ul className="activity-list">
                  {activityFeed.map((item) => (
                    <li key={item.title} className={`activity-item ${item.tone}`}>
                      <div className="activity-dot" />
                      <div>
                        <strong>{item.title}</strong>
                        <p>{item.detail}</p>
                      </div>
                      <span>{item.time}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="page-panel secure-links-section">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">Secure links</p>
                  <h3>Trusted destinations</h3>
                </div>
              </div>

              <div className="secure-links-grid">
                <div className="panel">
                  <div className="panel-head">
                    <div>
                      <p className="eyebrow">Saved links</p>
                      <h3>Safe connection list</h3>
                    </div>
                  </div>
                  <ul className="link-list">
                    {secureLinksState.map((link) => (
                      <li key={link.id} className="link-item">
                        <div>
                          <strong>{link.title}</strong>
                          <p>{link.description}</p>
                        </div>
                        <div>
                          <span className={`status-pill ${link.status.toLowerCase()}`}>
                            {link.status}
                          </span>
                          <a href={link.url} target="_blank" rel="noreferrer" className="ghost-button">
                            Open
                          </a>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="panel">
                  <div className="panel-head">
                    <div>
                      <p className="eyebrow">Add link</p>
                      <h3>Register secure destinations</h3>
                    </div>
                  </div>
                  <form className="form-grid" onSubmit={handleAddSecureLink}>
                    <label>
                      Name
                      <input
                        value={newSecureLink.title}
                        onChange={(event) => setNewSecureLink((prev) => ({ ...prev, title: event.target.value }))}
                        placeholder="Secure link name"
                        required
                      />
                    </label>
                    <label>
                      URL
                      <input
                        value={newSecureLink.url}
                        onChange={(event) => setNewSecureLink((prev) => ({ ...prev, url: event.target.value }))}
                        placeholder="https://"
                        required
                      />
                    </label>
                    <label>
                      Description
                      <input
                        value={newSecureLink.description}
                        onChange={(event) => setNewSecureLink((prev) => ({ ...prev, description: event.target.value }))}
                        placeholder="Why this link is safe"
                      />
                    </label>
                    <label>
                      Status
                      <select
                        value={newSecureLink.status}
                        onChange={(event) => setNewSecureLink((prev) => ({ ...prev, status: event.target.value as any }))}
                      >
                        <option value="Trusted">Trusted</option>
                        <option value="Review">Review</option>
                      </select>
                    </label>
                    {linkError && <div className="form-error">{linkError}</div>}
                    <div className="form-actions">
                      <button type="submit" className="primary-button">
                        Save secure link
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </section>
          </>
        )}

        {activeView === 'vault' && (
          <section className="page-panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Vault</p>
                <h3>Credential inventory</h3>
              </div>
              <button type="button" className="primary-button">
                Export backup
              </button>
            </div>
            <PasswordTable items={filteredVault} onAddItem={() => setIsAddSecretOpen(true)} />
          </section>
        )}

        {activeView === 'monitoring' && (
          <section className="page-panel">
            <div className="panel-grid">
              <div className="panel">
                <div className="panel-head">
                  <div>
                    <p className="eyebrow">Monitoring</p>
                    <h3>Threat surface</h3>
                  </div>
                </div>
                <div className="monitor-list">
                  <div><span>High-risk logins</span><strong>03</strong></div>
                  <div><span>Unverified devices</span><strong>02</strong></div>
                  <div><span>Pending reviews</span><strong>04</strong></div>
                </div>
              </div>

              <div className="panel">
                <div className="panel-head">
                  <div>
                    <p className="eyebrow">Live status</p>
                    <h3>Security health</h3>
                  </div>
                </div>
                <div className="monitor-list">
                  <div><span>2FA coverage</span><strong>87%</strong></div>
                  <div><span>Key rotation</span><strong>On track</strong></div>
                  <div><span>Backup integrity</span><strong>99.4%</strong></div>
                </div>
              </div>
            </div>
          </section>
        )}

        {activeView === 'reports' && (
          <section className="page-panel">
            <div className="report-grid">
              <div className="panel report-card">
                <p className="eyebrow">Risk snapshot</p>
                <h3>2 password issues</h3>
                <p>Two accounts require revalidation based on industry breach exposure and weak entropy.</p>
              </div>
              <div className="panel report-card">
                <p className="eyebrow">Compliance</p>
                <h3>Ready for audit</h3>
                <p>Rotation, backups and access policy summaries are aligned with the current security framework.</p>
              </div>
              <div className="panel report-card">
                <p className="eyebrow">Team sentiment</p>
                <h3>92% confidence</h3>
                <p>Users report strong confidence in vault protection, backup coverage, and access review flows.</p>
              </div>
            </div>
          </section>
        )}

        {activeView === 'settings' && (
          <section className="page-panel">
            <div className="settings-grid">
              <div className="panel">
                <div className="panel-head">
                  <div>
                    <p className="eyebrow">Plan</p>
                    <h3>Business configuration</h3>
                  </div>
                </div>

                <div className="plan-card">
                  <div>
                    <p className="eyebrow">Current tier</p>
                    <h4>Business</h4>
                  </div>
                  <span className="mini-tag">32 seats</span>
                </div>

                <ul className="feature-list">
                  {planFeatures.map((feature) => (
                    <li key={feature.name}>
                      <span>{feature.name}</span>
                      <strong>{feature.value}</strong>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="panel">
                <div className="panel-head">
                  <div>
                    <p className="eyebrow">Preferences</p>
                    <h3>Security defaults</h3>
                  </div>
                </div>

                <div className="toggle-list settings-toggle-list">
                  <label>
                    <input type="checkbox" defaultChecked />
                    Enforce 2FA for team access
                  </label>
                  <label>
                    <input type="checkbox" defaultChecked />
                    Detect compromised passwords
                  </label>
                  <label>
                    <input type="checkbox" defaultChecked />
                    Require device verification
                  </label>
                  <label>
                    <input type="checkbox" defaultChecked />
                    Enable encrypted backup sync
                  </label>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
