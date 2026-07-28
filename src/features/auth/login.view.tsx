import Link from 'next/link'

import { BrandMark } from '@/components/ui/brand-mark'
import { Button } from '@/components/ui/button'

import type { LoginViewProps } from './login.types'

export function LoginView(props: LoginViewProps) {
  return (
    <main className="auth-page">
      <section className="auth-form-side">
        <div className="auth-card">
          <div className="auth-brand">
            <BrandMark />
            <span>
              <span className="brand-name">Relay</span>
              <span className="brand-caption" style={{ color: '#667085' }}>
                DEEP LINK OPERATIONS
              </span>
            </span>
          </div>
          <h1>Welcome back</h1>
          <p>Manage every deep link from one clear workspace.</p>
          <form className="auth-form" method="post" onSubmit={props.onSubmit}>
            <label className="form-group">
              <span className="form-label">Work email</span>
              <input
                autoComplete="email"
                autoFocus
                className="field"
                inputMode="email"
                name="email"
                onChange={props.onEmailChange}
                placeholder="you@company.com"
                type="email"
                value={props.email}
              />
            </label>
            <label className="form-group">
              <span className="form-label">Password</span>
              <input
                autoComplete="current-password"
                className="field"
                name="password"
                onChange={props.onPasswordChange}
                placeholder="Enter your password"
                type="password"
                value={props.password}
              />
            </label>
            {props.recoveryAvailable ? (
              <Link className="auth-form-link" href="/forgot-password">
                Forgot password?
              </Link>
            ) : null}
            {props.error ? (
              <p className="form-error" role="alert">
                {props.error}
              </p>
            ) : null}
            <Button disabled={props.isSubmitting} type="submit">
              {props.isSubmitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
          {props.signupAvailable ? (
            <p className="auth-footer">
              New to Relay Cloud? <Link href="/signup">Create a workspace</Link>
            </p>
          ) : null}
        </div>
      </section>
      <aside className="auth-visual" aria-label="Relay product introduction">
        <div className="auth-message">
          <span aria-hidden="true" className="auth-message-symbol">
            ↗
          </span>
          <h2>Reliable routes for every app journey.</h2>
          <p>Create, validate and operate mobile deep links without rebuilding a landing site.</p>
        </div>
      </aside>
    </main>
  )
}
