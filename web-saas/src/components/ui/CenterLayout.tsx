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
        <div className="center-footer">
          <PrivacyNoticeLink />
        </div>
      </div>
    </div>
  )
}
