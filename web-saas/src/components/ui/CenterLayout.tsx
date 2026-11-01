import type { ReactNode } from 'react'
import { PrivacyNoticeLink } from '../PrivacyNotice'
import { Icon } from './Icon'
import { ThemeToggle } from './ThemeToggle'

/** Centered card layout for sign-in, unlock, MFA and the public transfer page. */
export function CenterLayout({ children }: { children: ReactNode }) {
  return (
    <div className="center-layout">
      <div className="center-card">
        <div className="center-top">
          <div className="brand">
            <div className="brand__mark">
              <Icon name="shieldCheck" size={20} />
            </div>
            <div>
              <div className="brand__name">SecureLink Vault</div>
              <div className="brand__tag">Criptografia de ponta a ponta</div>
            </div>
          </div>
          <ThemeToggle compact />
        </div>
        <section className="card">{children}</section>
        <ul className="trust-list" aria-label="Como seus dados são protegidos">
          <li>
            <Icon name="lock" size={16} />
            Cifrado no seu dispositivo
          </li>
          <li>
            <Icon name="server" size={16} />
            Servidor sem acesso ao conteúdo
          </li>
          <li>
            <Icon name="shieldCheck" size={16} />
            Verificação em duas etapas
          </li>
        </ul>
        <div className="center-footer">
          <PrivacyNoticeLink />
        </div>
      </div>
    </div>
  )
}
