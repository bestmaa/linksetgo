import Link from 'next/link'

import { Button } from '@/components/ui/button'

import { AccountAccessShellView } from './account-access-shell.view'
import type { AccountEmailActionViewProps } from './account-recovery.types'

type AccountEmailActionCopy = {
  asideLabel: string
  asideMessage: string
  asideTitle: string
  description: string
  submitLabel: string
  submittingLabel: string
  successMessage: string
  successTitle: string
  symbol: string
  title: string
}

export function AccountEmailActionView(
  props: AccountEmailActionViewProps & AccountEmailActionCopy,
) {
  const submitting = props.state.status === 'submitting'
  return (
    <AccountAccessShellView
      asideLabel={props.asideLabel}
      asideMessage={props.asideMessage}
      asideTitle={props.asideTitle}
      symbol={props.symbol}
    >
      {!props.available ? (
        <div className="auth-result">
          <h1>This service is unavailable</h1>
          <p>Account email services are not enabled on this installation.</p>
          <Link className="button button-primary" href="/admin/login">
            Back to sign in
          </Link>
        </div>
      ) : props.state.status === 'success' ? (
        <div className="auth-result" role="status">
          <span aria-hidden="true" className="auth-result-icon">
            ✓
          </span>
          <h1>{props.successTitle}</h1>
          <p>{props.successMessage}</p>
          <Link className="button button-secondary" href="/admin/login">
            Back to sign in
          </Link>
        </div>
      ) : (
        <>
          <h1>{props.title}</h1>
          <p>{props.description}</p>
          <form className="auth-form" method="post" onSubmit={props.onSubmit}>
            <label className="form-group">
              <span className="form-label">Account email</span>
              <input
                autoComplete="email"
                autoFocus
                className="field"
                inputMode="email"
                onChange={props.onEmailChange}
                placeholder="you@example.com"
                required
                type="email"
                value={props.email}
              />
            </label>
            {props.state.status === 'error' ? (
              <p className="form-error" role="alert">
                {props.state.message}
              </p>
            ) : null}
            <Button disabled={submitting} type="submit">
              {submitting ? props.submittingLabel : props.submitLabel}
            </Button>
          </form>
          <p className="auth-footer">
            <Link href="/admin/login">Back to sign in</Link>
          </p>
        </>
      )}
    </AccountAccessShellView>
  )
}
