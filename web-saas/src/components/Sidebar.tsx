import { Icon, type IconName } from './ui/Icon';
import { ThemeToggle } from './ui/ThemeToggle';

type SidebarProps = {
  activeView: string;
  onSelect: (view: string) => void;
  onLock: () => void;
  onSignOut: () => void;
  showAdmin?: boolean;
};

export const NAV_ITEMS: { key: string; label: string; icon: IconName }[] = [
  { key: 'dashboard', label: 'Visão geral', icon: 'dashboard' },
  { key: 'vault', label: 'Cofre', icon: 'key' },
  { key: 'files', label: 'Arquivos', icon: 'file' },
  { key: 'generator', label: 'Gerador', icon: 'wand' },
  { key: 'activity', label: 'Atividade', icon: 'activity' },
  { key: 'settings', label: 'Configurações', icon: 'settings' },
];

export const ADMIN_ITEM = { key: 'admin', label: 'Administração', icon: 'users' as IconName };

export function Sidebar({ activeView, onSelect, onLock, onSignOut, showAdmin = false }: SidebarProps) {
  const navItems = showAdmin ? [...NAV_ITEMS, ADMIN_ITEM] : NAV_ITEMS;
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand__mark">
          <Icon name="shieldCheck" size={20} />
        </div>
        <div>
          <div className="brand__name">SecureLink Vault</div>
          <div className="brand__tag">Criptografia de ponta a ponta</div>
        </div>
      </div>

      <nav className="nav" aria-label="Navegação principal">
        {navItems.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`nav__item ${activeView === item.key ? 'is-active' : ''}`}
            aria-current={activeView === item.key ? 'page' : undefined}
            onClick={() => onSelect(item.key)}
          >
            <Icon name={item.icon} />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="sidebar__footer">
        <ThemeToggle />
        <button type="button" className="btn btn--ghost" onClick={onLock}>
          <Icon name="lock" />
          Bloquear cofre
        </button>
        <button type="button" className="btn btn--ghost" onClick={onSignOut}>
          <Icon name="logout" />
          Sair
        </button>
      </div>
    </aside>
  );
}
