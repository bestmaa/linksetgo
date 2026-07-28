'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { useWorkspaceSelection } from '@/features/workspaces/workspace-context'
import { errorMessage, payloadClient } from '@/lib/client/payload-client'
import type { TeamConsoleDTO, TeamRole } from '@/lib/client/payload-types'

import { markInvitationRevoked, presentTeamInvitation, presentTeamMember } from './team.presenter'
import type { TeamViewProps } from './team.types'

export function useTeamController(): TeamViewProps {
  const { selectedWorkspace } = useWorkspaceSelection()
  const [consoleData, setConsoleData] = useState<TeamConsoleDTO | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<TeamRole>('member')
  const [delivery, setDelivery] = useState<'manual' | 'webhook'>('webhook')
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [manualUrl, setManualUrl] = useState<string | null>(null)
  const [savingInvite, setSavingInvite] = useState(false)
  const [editingID, setEditingID] = useState<string | null>(null)
  const [memberRole, setMemberRole] = useState<TeamRole>('member')
  const [memberStatus, setMemberStatus] = useState<'active' | 'disabled'>('active')
  const [memberError, setMemberError] = useState<string | null>(null)
  const [savingMember, setSavingMember] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [invitationToRevoke, setInvitationToRevoke] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    if (!selectedWorkspace) {
      setConsoleData(null)
      setError('No workspace is available for this account.')
      setIsLoading(false)
      return
    }
    try {
      setConsoleData(await payloadClient.getTeam(selectedWorkspace.organizationId))
    } catch (requestError) {
      setConsoleData(null)
      setError(errorMessage(requestError))
    } finally {
      setIsLoading(false)
    }
  }, [selectedWorkspace])

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timeout)
  }, [load])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(null), 4_000)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const members = useMemo(
    () => consoleData?.members.map((member) => presentTeamMember(member, consoleData)) ?? [],
    [consoleData],
  )
  const invitations = useMemo(
    () =>
      consoleData?.invitations.map((invitation) =>
        presentTeamInvitation(invitation, consoleData.canManage),
      ) ?? [],
    [consoleData],
  )
  const editingMember = members.find((member) => member.id === editingID) ?? null

  const submitInvite: TeamViewProps['onInvite'] = async (event) => {
    event.preventDefault()
    if (!selectedWorkspace) return
    setInviteError(null)
    setSavingInvite(true)
    try {
      const result = await payloadClient.createTeamInvitation({
        delivery,
        email: inviteEmail,
        organizationId: selectedWorkspace.organizationId,
        role: inviteRole,
      })
      setConsoleData((current) =>
        current
          ? { ...current, invitations: [result.invitation, ...current.invitations] }
          : current,
      )
      setManualUrl(result.manualUrl ?? null)
      setInviteEmail('')
      if (!result.manualUrl) setInviteOpen(false)
      setToast(result.manualUrl ? 'Manual invitation created.' : 'Invitation sent.')
    } catch (requestError) {
      setInviteError(errorMessage(requestError))
    } finally {
      setSavingInvite(false)
    }
  }

  const saveMember: TeamViewProps['onSaveMember'] = async (event) => {
    event.preventDefault()
    if (!selectedWorkspace || !editingMember) return
    setMemberError(null)
    setSavingMember(true)
    try {
      setConsoleData(
        await payloadClient.updateTeamMember(editingMember.id, {
          action: 'update',
          organizationId: selectedWorkspace.organizationId,
          role: memberRole,
          status: memberStatus,
        }),
      )
      setEditingID(null)
      setToast('Team member updated.')
    } catch (requestError) {
      setMemberError(errorMessage(requestError))
    } finally {
      setSavingMember(false)
    }
  }

  const removeMember = async () => {
    if (!selectedWorkspace || !editingMember) return
    setMemberError(null)
    setSavingMember(true)
    try {
      setConsoleData(
        await payloadClient.updateTeamMember(editingMember.id, {
          action: 'remove',
          organizationId: selectedWorkspace.organizationId,
        }),
      )
      setEditingID(null)
      setRemoving(false)
      setToast('Team member removed.')
    } catch (requestError) {
      setMemberError(errorMessage(requestError))
    } finally {
      setSavingMember(false)
    }
  }

  const confirmRevoke = async (id: string) => {
    if (!selectedWorkspace) return
    try {
      await payloadClient.revokeTeamInvitation(id, selectedWorkspace.organizationId)
      setConsoleData((current) => markInvitationRevoked(current, id))
      setToast('Invitation revoked.')
    } catch (requestError) {
      setToast(errorMessage(requestError))
    } finally {
      setInvitationToRevoke(null)
    }
  }

  return {
    canInviteOwner: consoleData?.canInviteOwner ?? false,
    canManage: consoleData?.canManage ?? false,
    canManualInvite: consoleData?.canManualInvite ?? false,
    error,
    invitationToRevoke,
    invitations,
    inviteDialog: {
      delivery,
      email: inviteEmail,
      error: inviteError,
      isOpen: inviteOpen,
      isSaving: savingInvite,
      manualUrl,
      role: inviteRole,
    },
    isLoading,
    memberDialog: {
      error: memberError,
      isOpen: Boolean(editingMember),
      isRemoving: removing,
      isSaving: savingMember,
      member: editingMember,
      role: memberRole,
      status: memberStatus,
    },
    members,
    onCancelRevoke: () => setInvitationToRevoke(null),
    onCloseInvite: () => {
      if (!savingInvite) {
        setInviteOpen(false)
        setInviteError(null)
        setManualUrl(null)
      }
    },
    onCloseMember: () => {
      if (!savingMember) {
        setEditingID(null)
        setRemoving(false)
      }
    },
    onConfirmRevoke: (id) => void confirmRevoke(id),
    onCopyManualUrl: () => {
      if (manualUrl) void window.navigator.clipboard.writeText(manualUrl)
    },
    onDeliveryChange: setDelivery,
    onEmailChange: setInviteEmail,
    onInvite: submitInvite,
    onMemberRoleChange: setMemberRole,
    onMemberStatusChange: setMemberStatus,
    onOpenInvite: () => {
      setManualUrl(null)
      setInviteError(null)
      setInviteOpen(true)
    },
    onOpenMember: (id) => {
      const member = members.find((item) => item.id === id)
      if (!member?.canEdit) return
      setEditingID(id)
      setMemberRole(member.role)
      setMemberStatus(member.status)
      setMemberError(null)
      setRemoving(false)
    },
    onRemoveMember: () => void removeMember(),
    onRequestRevoke: setInvitationToRevoke,
    onRetry: () => void load(),
    onRoleChange: setInviteRole,
    onSaveMember: saveMember,
    onToggleRemoveConfirmation: () => setRemoving((value) => !value),
    organizationName:
      consoleData?.organizationName || selectedWorkspace?.organizationName || 'Organization',
    toast,
    workspaceName: selectedWorkspace?.name || 'Workspace',
  }
}
