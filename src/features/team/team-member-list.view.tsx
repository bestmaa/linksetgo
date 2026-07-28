import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import type { TeamMemberViewModel } from './team.types'

type Props = {
  members: readonly TeamMemberViewModel[]
  onOpenMember: (id: string) => void
}

export function TeamMemberListView({ members, onOpenMember }: Props) {
  if (members.length === 0) {
    return (
      <div className="empty-state">
        <div>
          <h3>No team members</h3>
          <p>This organization does not have an active membership record.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="team-list">
      {members.map((member) => (
        <article className="team-member" key={member.id}>
          <span aria-hidden="true" className="avatar team-avatar">
            {member.name.charAt(0).toUpperCase()}
          </span>
          <span className="team-member-copy">
            <strong>
              {member.name}
              {member.isSelf ? <small className="team-self-label">You</small> : null}
            </strong>
            <span>{member.detail}</span>
          </span>
          <span className="team-member-badges">
            <Badge tone={member.roleTone}>{member.role}</Badge>
            <Badge tone={member.status === 'active' ? 'success' : 'neutral'}>{member.status}</Badge>
            {member.canEdit ? (
              <Button
                aria-label={`Edit ${member.name}`}
                onClick={() => onOpenMember(member.id)}
                variant="quiet"
              >
                Edit
              </Button>
            ) : null}
          </span>
        </article>
      ))}
    </div>
  )
}
