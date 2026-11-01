import { useState } from 'react'
import { Icon } from './Icon'

type Theme = 'dark' | 'light'
const STORAGE_KEY = 'sv-theme'

/** Reads the saved theme (per-browser preference only), falling back to the OS preference. */
export function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'dark' || saved === 'light') return saved
  } catch {
    /* storage unavailable */
  }
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme as Theme) || initialTheme())

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    applyTheme(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* ignore */
    }
  }

  const label = theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'
  return (
    <button type="button" className={`btn btn--ghost ${compact ? 'icon-btn' : ''}`} onClick={toggle} aria-label={label} title={label}>
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
      {!compact && <span>{theme === 'dark' ? 'Tema claro' : 'Tema escuro'}</span>}
    </button>
  )
}
