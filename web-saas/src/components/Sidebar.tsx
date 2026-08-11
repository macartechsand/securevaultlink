type SidebarProps = {
  activeView: string;
  onSelect: (view: string) => void;
};

const navItems = [
  { key: 'dashboard', label: 'Overview' },
  { key: 'vault', label: 'Vault' },
  { key: 'monitoring', label: 'Monitoring' },
  { key: 'reports', label: 'Reports' },
  { key: 'settings', label: 'Settings' },
];

export function Sidebar({ activeView, onSelect }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand-wrap">
        <div className="brand-badge">SL</div>
        <div>
          <p className="eyebrow">Secure vault</p>
          <h2>SecureLink</h2>
        </div>
      </div>

      <nav className="nav-list" aria-label="Sidebar navigation">
        {navItems.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`nav-item ${activeView === item.key ? 'active' : ''}`}
            onClick={() => onSelect(item.key)}
          >
            <span className="nav-dot" />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="sidebar-card">
        <p className="card-label">Current plan</p>
        <h3>Business</h3>
        <p>32 seats active</p>
      </div>
    </aside>
  );
}
