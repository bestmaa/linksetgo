import type { FormEventHandler } from 'react'

import type { BadgeTone } from '@/components/ui/badge'
import type { TeamRole } from '@/lib/client/payload-types'

export type TeamMemberViewModel = {
  canEdit: boolean
  detail: string
  id: string
  isSelf: boolean
  name: string
  role: TeamRole
  roleTone: BadgeTone
  status: 'active' | 'disabled'
}

export type TeamInvitationViewModel = {
  canRevoke: boolean
  deliveryMode: 'manual' | 'webhook'
  email: string
  expiresLabel: string
  id: string
  inviter: string
  role: TeamRole
  roleTone: BadgeTone
  status: 'accepted' | 'expired' | 'pending' | 'revoked'
}

export type TeamInviteDialogState = {
  delivery: 'manual' | 'webhook'
  email: string
  error: string | null
  isOpen: boolean
  isSaving: boolean
  manualUrl: string | null
  role: TeamRole
}

export type TeamMemberDialogState = {
  error: string | null
  isOpen: boolean
  isRemoving: boolean
  isSaving: boolean
  member: TeamMemberViewModel | null
  role: TeamRole
  status: 'active' | 'disabled'
}

export type TeamViewProps = {
  canInviteOwner: boolean
  canManage: boolean
  canManualInvite: boolean
  error: string | null
  invitationToRevoke: string | null
  invitations: readonly TeamInvitationViewModel[]
  inviteDialog: TeamInviteDialogState
  isLoading: boolean
  memberDialog: TeamMemberDialogState
  members: readonly TeamMemberViewModel[]
  onCancelRevoke: () => void
  onCloseInvite: () => void
  onCloseMember: () => void
  onConfirmRevoke: (id: string) => void
  onCopyManualUrl: () => void
  onDeliveryChange: (value: 'manual' | 'webhook') => void
  onEmailChange: (value: string) => void
  onInvite: FormEventHandler<HTMLFormElement>
  onMemberRoleChange: (value: TeamRole) => void
  onMemberStatusChange: (value: 'active' | 'disabled') => void
  onOpenInvite: () => void
  onOpenMember: (id: string) => void
  onRemoveMember: () => void
  onRequestRevoke: (id: string) => void
  onRetry: () => void
  onRoleChange: (value: TeamRole) => void
  onSaveMember: FormEventHandler<HTMLFormElement>
  onToggleRemoveConfirmation: () => void
  organizationName: string
  toast: string | null
  workspaceName: string
}
