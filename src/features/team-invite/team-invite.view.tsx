import { BrandMark } from '@/components/ui/brand-mark'
import { Button } from '@/components/ui/button'

import { TeamInviteCreateView } from './team-invite-create.view'
import type { TeamInviteViewProps } from './team-invite.types'

export function TeamInviteView(props: TeamInviteViewProps) {
  const ready = props.state.status === 'ready' ? props.state.preview : null
  return (
    <main className="auth-page team-invite-page">
      <section className="auth-form-side">
        <div className="auth-card">
          <div className="auth-brand">
            <BrandMark />
            <span>
              <span className="brand-name">LinksetGo</span>
              <span className="brand-caption" style={{ color: '#667085' }}>
                TEAM INVITATION
              </span>
            </span>
          </div>

          {props.state.status === 'checking' ? (
            <div aria-live="polite" className="auth-result">
              <span aria-hidden="true" className="auth-result-icon auth-result-loading">
                ↻
              </span>
              <h1>Checking your invitation</h1>
              <p>LinksetGo is validating this one-time link.</p>
            </div>
          ) : props.state.status === 'error' ? (
            <div className="auth-result">
              <span aria-hidden="true" className="auth-result-icon auth-result-error">
                !
              </span>
              <h1>Invitation unavailable</h1>
              <p role="alert">{props.state.message}</p>
            </div>
          ) : props.state.status === 'accepted' ? (
            <div className="auth-result">
              <span aria-hidden="true" className="auth-result-icon">
                ✓
              </span>
              <h1>You joined {props.state.organizationName}</h1>
              <p>
                Your organization access is active.
                {props.state.signInRequired ? ' Sign in with your new account.' : ''}
              </p>
              <Button onClick={props.onOpenLinksetGo}>
                {props.state.signInRequired ? 'Sign in to LinksetGo' : 'Open LinksetGo'}
              </Button>
            </div>
          ) : ready ? (
            <>
              <div className="team-invite-summary">
                <span className="eyebrow">Organization invitation</span>
                <h1>Join {ready.organizationName}</h1>
                <p>
                  Invitation for <strong>{ready.emailMasked}</strong> with{' '}
                  <strong>{ready.role}</strong> access.
                </p>
              </div>
              {ready.accountMode === 'create' ? (
                <TeamInviteCreateView {...props} />
              ) : ready.accountMode === 'accept' ? (
                <div className="auth-form">
                  <p className="form-help">
                    You are signed in with the invited account. Accepting grants organization-wide
                    access.
                  </p>
                  {props.error ? (
                    <p className="form-error" role="alert">
                      {props.error}
                    </p>
                  ) : null}
                  <Button disabled={props.isSubmitting} onClick={props.onAccept}>
                    {props.isSubmitting ? 'Joining…' : 'Accept invitation'}
                  </Button>
                </div>
              ) : ready.accountMode === 'sign-in' ? (
                <div className="auth-result team-invite-action">
                  <p>An account already exists for this email. Sign in to continue.</p>
                  <Button onClick={props.onSignIn}>Sign in with invited account</Button>
                </div>
              ) : ready.accountMode === 'wrong-account' ? (
                <div className="auth-result team-invite-action">
                  <p>
                    You are signed in with another account. Switch accounts to accept this
                    invitation.
                  </p>
                  {props.error ? (
                    <p className="form-error" role="alert">
                      {props.error}
                    </p>
                  ) : null}
                  <Button
                    disabled={props.isSubmitting}
                    onClick={props.onUseDifferentAccount}
                    variant="secondary"
                  >
                    Use a different account
                  </Button>
                </div>
              ) : (
                <div className="auth-result team-invite-action">
                  <p>
                    This LinksetGo installation cannot create the invited account automatically. Ask
                    its administrator to create your matching account, then reopen this link.
                  </p>
                </div>
              )}
            </>
          ) : null}
        </div>
      </section>
      <aside className="auth-visual" aria-label="Secure LinksetGo team access">
        <div className="auth-message">
          <span aria-hidden="true" className="auth-message-symbol">
            ↗
          </span>
          <h2>One invitation. One account. One use.</h2>
          <p>
            Invitation tokens expire, are stored only as hashes, and cannot be replayed after
            acceptance.
          </p>
        </div>
      </aside>
    </main>
  )
}
