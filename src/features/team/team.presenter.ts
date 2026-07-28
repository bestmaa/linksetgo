import type {
  TeamConsoleDTO,
  TeamInvitationConsoleDTO,
  TeamMemberConsoleDTO,
  TeamRole,
} from '@/lib/client/payload-types'

import type { TeamInvitationViewModel, TeamMemberViewModel } from './team.types'

const roleTone = (role: TeamRole) =>
  role === 'owner' ? 'blue' : role === 'admin' ? 'success' : 'neutral'

export const presentTeamMember = (
  member: TeamMemberConsoleDTO,
  consoleData: TeamConsoleDTO,
): TeamMemberViewModel => ({
  canEdit: consoleData.canManage && (consoleData.canInviteOwner || member.role !== 'owner'),
  detail: member.email,
  id: String(member.id),
  isSelf: member.isSelf,
  name: member.name,
  role: member.role,
  roleTone: roleTone(member.role),
  status: member.status,
})

const dateLabel = (value: string): string => {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime())
    ? 'Unknown expiry'
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(parsed)
}

export const presentTeamInvitation = (
  invitation: TeamInvitationConsoleDTO,
  canManage: boolean,
): TeamInvitationViewModel => ({
  canRevoke: canManage && invitation.status === 'pending',
  deliveryMode: invitation.deliveryMode,
  email: invitation.email,
  expiresLabel: dateLabel(invitation.expiresAt),
  id: String(invitation.id),
  inviter: invitation.invitedByName,
  role: invitation.role,
  roleTone: roleTone(invitation.role),
  status: invitation.status,
})

export const markInvitationRevoked = (
  current: TeamConsoleDTO | null,
  invitationID: string,
): TeamConsoleDTO | null =>
  current
    ? {
        ...current,
        invitations: current.invitations.map((invitation) =>
          String(invitation.id) === invitationID
            ? { ...invitation, status: 'revoked' }
            : invitation,
        ),
      }
    : null
