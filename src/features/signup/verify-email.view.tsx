import Link from 'next/link'

import { BrandMark } from '@/components/ui/brand-mark'

import type { VerifyEmailViewProps } from './verify-email.types'

export function VerifyEmailView(props: VerifyEmailViewProps) {
  return (
    <main className="auth-page verify-email-page">
      <section className="auth-form-side">
        <div className="auth-card">
          <div className="auth-brand">
            <BrandMark />
            <span>
              <span className="brand-name">LinksetGo</span>
              <span className="brand-caption" style={{ color: '#667085' }}>
                CLOUD
              </span>
            </span>
          </div>
          <div aria-live="polite" className="auth-result">
            {props.state.status === 'checking' ? (
              <>
                <span aria-hidden="true" className="auth-result-icon auth-result-loading">
                  ↻
                </span>
                <h1>Verifying your email</h1>
                <p>Hold on while LinksetGo activates your workspace.</p>
              </>
            ) : props.state.status === 'verified' ? (
              <>
                <span aria-hidden="true" className="auth-result-icon">
                  ✓
                </span>
                <h1>Your workspace is ready</h1>
                <p>
                  <strong>{props.state.email}</strong> is verified. You can now sign in.
                </p>
                <Link className="button button-primary" href="/admin/login?next=/admin/links">
                  Sign in and create your first link
                </Link>
              </>
            ) : (
              <>
                <span aria-hidden="true" className="auth-result-icon auth-result-error">
                  !
                </span>
                <h1>Verification failed</h1>
                <p role="alert">{props.state.message}</p>
                <Link className="button button-secondary" href="/resend-verification">
                  Send a new verification link
                </Link>
              </>
            )}
          </div>
        </div>
      </section>
      <aside className="auth-visual" aria-label="LinksetGo Cloud verification">
        <div className="auth-message">
          <span aria-hidden="true" className="auth-message-symbol">
            ✓
          </span>
          <h2>Secure by default, from the first link.</h2>
          <p>Your tenant stays inactive until ownership of the account email is confirmed.</p>
        </div>
      </aside>
    </main>
  )
}
