import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ErrorState, TableSkeleton } from '@/components/ui/load-state'

import { TeamInvitationListView } from './team-invitation-list.view'
import { TeamInviteDialogView } from './team-invite-dialog.view'
import { TeamMemberDialogView } from './team-member-dialog.view'
import { TeamMemberListView } from './team-member-list.view'
import type { TeamViewProps } from './team.types'

export function TeamView(props: TeamViewProps) {
  return (
    <main className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Organization access</p>
          <h1 className="page-title">Team</h1>
          <p className="page-copy">
            Manage access to every workspace in {props.organizationName}. LinksetGo enforces owner
            safety and plan limits on the server.
          </p>
        </div>
        <div className="team-header-actions">
          <Badge tone="neutral">
            {props.members.length} {props.members.length === 1 ? 'member' : 'members'}
          </Badge>
          {props.canManage ? <Button onClick={props.onOpenInvite}>Invite member</Button> : null}
        </div>
      </header>

      {props.isLoading ? (
        <section className="card">
          <TableSkeleton rows={5} />
        </section>
      ) : null}
      {props.error ? <ErrorState message={props.error} onRetry={props.onRetry} /> : null}
      {!props.isLoading && !props.error ? (
        <div className="team-sections">
          <section aria-labelledby="team-members-title" className="card">
            <header className="card-header">
              <div>
                <h2 className="card-title" id="team-members-title">
                  Organization members
                </h2>
                <p className="card-description">
                  Roles apply to every workspace, including {props.workspaceName}.
                </p>
              </div>
              <Badge tone={props.canManage ? 'blue' : 'neutral'}>
                {props.canManage ? 'Manage access' : 'Read only'}
              </Badge>
            </header>
            <TeamMemberListView members={props.members} onOpenMember={props.onOpenMember} />
          </section>

          <section aria-labelledby="team-invitations-title" className="card">
            <header className="card-header">
              <div>
                <h2 className="card-title" id="team-invitations-title">
                  Invitations
                </h2>
                <p className="card-description">
                  Pending links expire automatically and work only once.
                </p>
              </div>
              <Badge tone="neutral">{props.invitations.length} total</Badge>
            </header>
            <TeamInvitationListView
              invitationToRevoke={props.invitationToRevoke}
              invitations={props.invitations}
              onCancelRevoke={props.onCancelRevoke}
              onConfirmRevoke={props.onConfirmRevoke}
              onRequestRevoke={props.onRequestRevoke}
            />
          </section>
        </div>
      ) : null}

      {props.inviteDialog.isOpen ? <TeamInviteDialogView {...props} /> : null}
      {props.memberDialog.isOpen ? <TeamMemberDialogView {...props} /> : null}
      {props.toast ? (
        <div aria-live="polite" className="toast-region">
          <div className="toast">{props.toast}</div>
        </div>
      ) : null}
    </main>
  )
}
