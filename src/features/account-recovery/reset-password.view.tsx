import Link from 'next/link'

import { Button } from '@/components/ui/button'

import { AccountAccessShellView } from './account-access-shell.view'
import type { ResetPasswordViewProps } from './account-recovery.types'

export function ResetPasswordView(props: ResetPasswordViewProps) {
  const waiting = props.state.status === 'checking' || props.state.status === 'submitting'
  return (
    <AccountAccessShellView
      asideLabel="Relay Cloud secure password reset"
      asideMessage="The reset token is removed from the browser address before your password is submitted."
      asideTitle="A fresh password. The same protected workspace."
      symbol="🔒"
    >
      {props.state.status === 'success' ? (
        <div className="auth-result" role="status">
          <span aria-hidden="true" className="auth-result-icon">
            ✓
          </span>
          <h1>Password updated</h1>
          <p>Your one-time reset link has been consumed. Sign in with your new password.</p>
          <Link className="button button-primary" href="/admin/login">
            Sign in to Relay
          </Link>
        </div>
      ) : props.state.status === 'checking' ? (
        <div aria-live="polite" className="auth-result">
          <span aria-hidden="true" className="auth-result-icon auth-result-loading">
            ↻
          </span>
          <h1>Checking reset link</h1>
          <p>Relay is preparing the secure password form.</p>
        </div>
      ) : props.state.status === 'invalid' ? (
        <div className="auth-result">
          <span aria-hidden="true" className="auth-result-icon auth-result-error">
            !
          </span>
          <h1>Reset link unavailable</h1>
          <p role="alert">{props.state.message}</p>
          <Link className="button button-primary" href="/forgot-password">
            Request a new link
          </Link>
        </div>
      ) : (
        <>
          <h1>Choose a new password</h1>
          <p>Use 12–128 characters with upper, lower, number, and symbol.</p>
          <form className="auth-form" method="post" onSubmit={props.onSubmit}>
            <PasswordField
              autoComplete="new-password"
              label="New password"
              onChange={props.onPasswordChange}
              showPassword={props.showPassword}
              value={props.password}
            />
            <PasswordField
              autoComplete="new-password"
              label="Confirm new password"
              onChange={props.onConfirmPasswordChange}
              showPassword={props.showPassword}
              value={props.confirmPassword}
            />
            <label className="auth-checkbox auth-password-toggle">
              <input
                checked={props.showPassword}
                onChange={props.onShowPasswordChange}
                type="checkbox"
              />
              <span>Show passwords</span>
            </label>
            {props.state.status === 'error' ? (
              <p className="form-error" role="alert">
                {props.state.message}
              </p>
            ) : null}
            <Button disabled={waiting} type="submit">
              {props.state.status === 'submitting' ? 'Updating…' : 'Update password'}
            </Button>
          </form>
          <p className="auth-footer">
            Need a new link? <Link href="/forgot-password">Start again</Link>
          </p>
        </>
      )}
    </AccountAccessShellView>
  )
}

type PasswordFieldProps = {
  autoComplete: string
  label: string
  onChange: ResetPasswordViewProps['onPasswordChange']
  showPassword: boolean
  value: string
}

function PasswordField(props: PasswordFieldProps) {
  return (
    <label className="form-group">
      <span className="form-label">{props.label}</span>
      <input
        autoComplete={props.autoComplete}
        className="field"
        onChange={props.onChange}
        required
        type={props.showPassword ? 'text' : 'password'}
        value={props.value}
      />
    </label>
  )
}
