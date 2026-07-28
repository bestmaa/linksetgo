import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import type { TeamInvitationViewModel } from './team.types'

type Props = {
  invitationToRevoke: string | null
  invitations: readonly TeamInvitationViewModel[]
  onCancelRevoke: () => void
  onConfirmRevoke: (id: string) => void
  onRequestRevoke: (id: string) => void
}

const statusTone = (status: TeamInvitationViewModel['status']) =>
  status === 'pending'
    ? 'warning'
    : status === 'accepted'
      ? 'success'
      : status === 'revoked'
        ? 'danger'
        : 'neutral'

export function TeamInvitationListView(props: Props) {
  if (props.invitations.length === 0) {
    return (
      <div className="empty-state">
        <div>
          <h3>No invitations yet</h3>
          <p>Owners and admins can invite people without sharing account passwords.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="team-list">
      {props.invitations.map((invitation) => {
        const confirming = props.invitationToRevoke === invitation.id
        return (
          <article className="team-member" key={invitation.id}>
            <span aria-hidden="true" className="avatar team-invite-avatar">
              {invitation.email.charAt(0).toUpperCase()}
            </span>
            <span className="team-member-copy">
              <strong>{invitation.email}</strong>
              <span>
                Invited by {invitation.inviter} · expires {invitation.expiresLabel}
              </span>
            </span>
            <span className="team-member-badges">
              <Badge tone={invitation.roleTone}>{invitation.role}</Badge>
              <Badge tone={statusTone(invitation.status)}>{invitation.status}</Badge>
              {confirming ? (
                <>
                  <Button onClick={props.onCancelRevoke} variant="quiet">
                    Cancel
                  </Button>
                  <Button onClick={() => props.onConfirmRevoke(invitation.id)} variant="danger">
                    Confirm
                  </Button>
                </>
              ) : invitation.canRevoke ? (
                <Button onClick={() => props.onRequestRevoke(invitation.id)} variant="quiet">
                  Revoke
                </Button>
              ) : null}
            </span>
          </article>
        )
      })}
    </div>
  )
}
