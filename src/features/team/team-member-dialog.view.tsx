import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { TeamViewProps } from './team.types'

type TeamRole = TeamViewProps['memberDialog']['role']
const roles: TeamRole[] = ['viewer', 'member', 'admin', 'owner']

type Props = Pick<
  TeamViewProps,
  | 'canInviteOwner'
  | 'memberDialog'
  | 'onCloseMember'
  | 'onMemberRoleChange'
  | 'onMemberStatusChange'
  | 'onRemoveMember'
  | 'onSaveMember'
  | 'onToggleRemoveConfirmation'
>

export function TeamMemberDialogView(props: Props) {
  const { member } = props.memberDialog
  if (!member) return null

  return (
    <div
      aria-labelledby="team-member-title"
      aria-modal="true"
      className="modal-backdrop"
      role="dialog"
    >
      <form className="modal team-modal" onSubmit={props.onSaveMember}>
        <header className="modal-header">
          <div>
            <h2 id="team-member-title">Manage {member.name}</h2>
            <p className="card-description">{member.detail}</p>
          </div>
          <button
            aria-label="Close member editor"
            className="icon-button"
            disabled={props.memberDialog.isSaving}
            onClick={props.onCloseMember}
            type="button"
          >
            <Icon name="x" />
          </button>
        </header>
        <div className="modal-body">
          {props.memberDialog.isRemoving ? (
            <aside className="team-danger-zone">
              <strong>Remove this member?</strong>
              <p>
                Their organization and workspace access ends immediately. Relay will never remove
                the last active owner.
              </p>
              <div className="team-danger-actions">
                <Button
                  disabled={props.memberDialog.isSaving}
                  onClick={props.onToggleRemoveConfirmation}
                  variant="secondary"
                >
                  Keep member
                </Button>
                <Button
                  disabled={props.memberDialog.isSaving}
                  onClick={props.onRemoveMember}
                  variant="danger"
                >
                  {props.memberDialog.isSaving ? 'Removing…' : 'Remove access'}
                </Button>
              </div>
            </aside>
          ) : (
            <div className="form-grid">
              <label className="form-group" htmlFor="team-member-role">
                <span className="form-label">Role</span>
                <select
                  className="field"
                  id="team-member-role"
                  onChange={(event) =>
                    props.onMemberRoleChange(event.currentTarget.value as TeamRole)
                  }
                  value={props.memberDialog.role}
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
              <label className="form-group" htmlFor="team-member-status">
                <span className="form-label">Status</span>
                <select
                  className="field"
                  id="team-member-status"
                  onChange={(event) =>
                    props.onMemberStatusChange(event.currentTarget.value as 'active' | 'disabled')
                  }
                  value={props.memberDialog.status}
                >
                  <option value="active">Active</option>
                  <option value="disabled">Disabled</option>
                </select>
              </label>
            </div>
          )}
          {member.isSelf ? (
            <p className="form-help">
              Relay blocks changes that would remove your own management access.
            </p>
          ) : null}
          {props.memberDialog.error ? (
            <p className="form-error" role="alert">
              {props.memberDialog.error}
            </p>
          ) : null}
        </div>
        {!props.memberDialog.isRemoving ? (
          <footer className="modal-footer team-member-footer">
            <Button
              disabled={props.memberDialog.isSaving}
              onClick={props.onToggleRemoveConfirmation}
              variant="danger"
            >
              Remove member
            </Button>
            <span className="team-footer-spacer" />
            <Button
              disabled={props.memberDialog.isSaving}
              onClick={props.onCloseMember}
              variant="secondary"
            >
              Cancel
            </Button>
            <Button disabled={props.memberDialog.isSaving} type="submit">
              {props.memberDialog.isSaving ? 'Saving…' : 'Save changes'}
            </Button>
          </footer>
        ) : null}
      </form>
    </div>
  )
}
