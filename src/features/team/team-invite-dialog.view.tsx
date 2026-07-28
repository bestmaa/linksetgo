import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { TeamViewProps } from './team.types'

type TeamRole = TeamViewProps['inviteDialog']['role']
const roles: TeamRole[] = ['viewer', 'member', 'admin', 'owner']

type Props = Pick<
  TeamViewProps,
  | 'canInviteOwner'
  | 'canManualInvite'
  | 'inviteDialog'
  | 'onCloseInvite'
  | 'onCopyManualUrl'
  | 'onDeliveryChange'
  | 'onEmailChange'
  | 'onInvite'
  | 'onRoleChange'
  | 'organizationName'
>

export function TeamInviteDialogView(props: Props) {
  const dialog = props.inviteDialog
  return (
    <div
      aria-labelledby="team-invite-title"
      aria-modal="true"
      className="modal-backdrop"
      role="dialog"
    >
      <form className="modal team-modal" noValidate onSubmit={props.onInvite}>
        <header className="modal-header">
          <div>
            <h2 id="team-invite-title">Invite a team member</h2>
            <p className="card-description">
              Grant organization-wide access to {props.organizationName}.
            </p>
          </div>
          <button
            aria-label="Close invitation form"
            className="icon-button"
            disabled={dialog.isSaving}
            onClick={props.onCloseInvite}
            type="button"
          >
            <Icon name="x" />
          </button>
        </header>
        <div className="modal-body">
          {dialog.manualUrl ? (
            <div className="team-manual-link">
              <strong>Copy this one-time invitation now</strong>
              <p>LinksetGo stores only its SHA-256 hash. This URL is not shown again.</p>
              <div className="team-copy-row">
                <input
                  aria-label="Manual invitation URL"
                  className="field"
                  readOnly
                  value={dialog.manualUrl}
                />
                <Button onClick={props.onCopyManualUrl} variant="secondary">
                  Copy
                </Button>
              </div>
            </div>
          ) : (
            <>
              <label className="form-group" htmlFor="team-invite-email">
                <span className="form-label">Work email *</span>
                <input
                  autoComplete="email"
                  autoFocus
                  className="field"
                  id="team-invite-email"
                  maxLength={254}
                  onChange={(event) => props.onEmailChange(event.currentTarget.value)}
                  placeholder="teammate@company.com"
                  required
                  type="email"
                  value={dialog.email}
                />
              </label>
              <div className="form-grid">
                <label className="form-group" htmlFor="team-invite-role">
                  <span className="form-label">Organization role *</span>
                  <select
                    className="field"
                    id="team-invite-role"
                    onChange={(event) => props.onRoleChange(event.currentTarget.value as TeamRole)}
                    value={dialog.role}
                  >
                    {roles.map((role) => (
                      <option
                        disabled={role === 'owner' && !props.canInviteOwner}
                        key={role}
                        value={role}
                      >
                        {role.charAt(0).toUpperCase() + role.slice(1)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-group" htmlFor="team-invite-delivery">
                  <span className="form-label">Delivery *</span>
                  <select
                    className="field"
                    id="team-invite-delivery"
                    onChange={(event) =>
                      props.onDeliveryChange(event.currentTarget.value as 'manual' | 'webhook')
                    }
                    value={dialog.delivery}
                  >
                    <option value="webhook">Secure email webhook</option>
                    {props.canManualInvite ? (
                      <option value="manual">Manual (platform admin)</option>
                    ) : null}
                  </select>
                </label>
              </div>
              <p className="form-help">
                Links expire after seven days and become unusable after acceptance or revocation.
              </p>
            </>
          )}
          {dialog.error ? (
            <p className="form-error" role="alert">
              {dialog.error}
            </p>
          ) : null}
        </div>
        <footer className="modal-footer">
          <Button disabled={dialog.isSaving} onClick={props.onCloseInvite} variant="secondary">
            {dialog.manualUrl ? 'Done' : 'Cancel'}
          </Button>
          {!dialog.manualUrl ? (
            <Button disabled={dialog.isSaving || !dialog.email.trim()} type="submit">
              {dialog.isSaving ? 'Creating…' : 'Create invitation'}
            </Button>
          ) : null}
        </footer>
      </form>
    </div>
  )
}
