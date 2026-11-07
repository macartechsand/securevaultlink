import { useState } from 'react';
import { Icon, type IconName } from './ui/Icon';
import { ThemeToggle } from './ui/ThemeToggle';

type NavItem = { key: string; label: string; icon: IconName };

/** Counters shown next to a menu entry (only problems that need action). */
export type NavCounts = Partial<Record<string, { value: number; tone?: 'danger' | 'warn' }>>;

export const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Cofre',
    items: [
      { key: 'dashboard', label: 'Visão geral', icon: 'dashboard' },
      { key: 'vault', label: 'Cofre', icon: 'key' },
      { key: 'files', label: 'Arquivos', icon: 'file' },
      { key: 'trash', label: 'Lixeira', icon: 'trash' },
    ],
  },
  {
    label: 'Proteção',
    items: [
      { key: 'rotation', label: 'Rotação', icon: 'refresh' },
      { key: 'generator', label: 'Gerador', icon: 'wand' },
      { key: 'activity', label: 'Atividade', icon: 'activity' },
    ],
  },
  { label: 'Conta', items: [{ key: 'settings', label: 'Configurações', icon: 'settings' }] },
];

export const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

export const ADMIN_ITEM: NavItem = { key: 'admin', label: 'Administração', icon: 'users' };

/** Entries kept in the phone bottom bar; the rest go to the "Mais" sheet. */
const BOTTOM_KEYS = ['dashboard', 'vault', 'files', 'rotation'];

type NavProps = {
  activeView: string;
  onSelect: (view: string) => void;
  onLock: () => void;
  onSignOut: () => void;
  showAdmin?: boolean;
  counts?: NavCounts;
};

type SidebarProps = NavProps & { email: string; idleMinutes: number };

function Count({ count }: { count?: { value: number; tone?: 'danger' | 'warn' } }) {
  if (!count || count.value <= 0) return null;
  return <span className={`nav__count ${count.tone === 'warn' ? 'nav__count--warn' : ''}`}>{count.value > 99 ? '99+' : count.value}</span>;
}

function NavButton({ item, activeView, onSelect, counts }: { item: NavItem } & Pick<NavProps, 'activeView' | 'onSelect' | 'counts'>) {
  const active = activeView === item.key;
  return (
    <button
      type="button"
      className={`nav__item ${active ? 'is-active' : ''}`}
      aria-current={active ? 'page' : undefined}
      onClick={() => onSelect(item.key)}
    >
      <Icon name={item.icon} />
      {item.label}
      <Count count={counts?.[item.key]} />
    </button>
  );
}

export function Sidebar({ activeView, onSelect, onLock, onSignOut, showAdmin = false, counts, email, idleMinutes }: SidebarProps) {
  const sections = showAdmin
    ? NAV_SECTIONS.map((s) => (s.label === 'Conta' ? { ...s, items: [...s.items, ADMIN_ITEM] } : s))
    : NAV_SECTIONS;
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
        {sections.map((section) => (
          <div key={section.label} className="nav__section">
            <p className="nav__label">{section.label}</p>
            {section.items.map((item) => (
              <NavButton key={item.key} item={item} activeView={activeView} onSelect={onSelect} counts={counts} />
            ))}
          </div>
        ))}
      </nav>

      <div className="status-card" aria-label="Estado da proteção desta sessão">
        <div className="status-card__title">
          <span className="live-dot" aria-hidden="true" />
          Cofre desbloqueado
        </div>
        <ul>
          <li>
            <Icon name="check" size={13} />
            AES-256-GCM no seu dispositivo
          </li>
          <li>
            <Icon name="check" size={13} />
            Servidor sem acesso ao conteúdo
          </li>
          <li>
            <Icon name="check" size={13} />
            Bloqueio após {idleMinutes} min sem uso
          </li>
        </ul>
        <button type="button" className="btn btn--sm btn--block" onClick={onLock}>
          <Icon name="lock" size={15} />
          Bloquear agora
        </button>
      </div>

      <div className="user-chip">
        <span className="user-chip__avatar" aria-hidden="true">
          {email.slice(0, 1) || '?'}
        </span>
        <span className="user-chip__email" title={email}>
          {email}
        </span>
        <ThemeToggle compact />
        <button type="button" className="btn btn--ghost icon-btn" onClick={onSignOut} aria-label="Sair" title="Sair">
          <Icon name="logout" />
        </button>
      </div>
    </aside>
  );
}

/** Phone navigation: four main sections plus a "Mais" sheet with everything else. */
export function BottomNav({ activeView, onSelect, onLock, onSignOut, showAdmin = false, counts }: NavProps) {
  const [open, setOpen] = useState(false);
  const all = showAdmin ? [...NAV_ITEMS, ADMIN_ITEM] : NAV_ITEMS;
  const main = all.filter((i) => BOTTOM_KEYS.includes(i.key));
  const rest = all.filter((i) => !BOTTOM_KEYS.includes(i.key));
  const select = (key: string) => {
    setOpen(false);
    onSelect(key);
  };
  return (
    <>
      <nav className="bottom-nav" aria-label="Navegação principal">
        {main.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`bottom-nav__item ${activeView === item.key ? 'is-active' : ''}`}
            aria-current={activeView === item.key ? 'page' : undefined}
            onClick={() => select(item.key)}
          >
            <Icon name={item.icon} size={20} />
            {item.label}
            <Count count={counts?.[item.key]} />
          </button>
        ))}
        <button
          type="button"
          className={`bottom-nav__item ${rest.some((i) => i.key === activeView) ? 'is-active' : ''}`}
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <Icon name="more" size={20} />
          Mais
        </button>
      </nav>
      {open && (
        <>
          <div className="sheet-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="sheet" role="dialog" aria-modal="true" aria-label="Mais opções">
            <div className="sheet__handle" />
            {rest.map((item) => (
              <NavButton key={item.key} item={item} activeView={activeView} onSelect={select} counts={counts} />
            ))}
            <div className="row-between">
              <ThemeToggle />
              <div className="row">
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => {
                    setOpen(false);
                    onLock();
                  }}
                >
                  <Icon name="lock" />
                  Bloquear
                </button>
                <button type="button" className="btn btn--ghost" onClick={onSignOut}>
                  <Icon name="logout" />
                  Sair
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
