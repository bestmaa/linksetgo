import type { ReactNode } from 'react'

import { BrandMark } from '@/components/ui/brand-mark'

type AccountAccessShellProps = {
  asideLabel: string
  asideMessage: string
  asideTitle: string
  children: ReactNode
  symbol: string
}

export function AccountAccessShellView(props: AccountAccessShellProps) {
  return (
    <main className="auth-page">
      <section className="auth-form-side">
        <div className="auth-card">
          <div className="auth-brand">
            <BrandMark />
            <span>
              <span className="brand-name">Relay</span>
              <span className="brand-caption" style={{ color: '#667085' }}>
                CLOUD
              </span>
            </span>
          </div>
          {props.children}
        </div>
      </section>
      <aside className="auth-visual" aria-label={props.asideLabel}>
        <div className="auth-message">
          <span aria-hidden="true" className="auth-message-symbol">
            {props.symbol}
          </span>
          <h2>{props.asideTitle}</h2>
          <p>{props.asideMessage}</p>
        </div>
      </aside>
    </main>
  )
}
