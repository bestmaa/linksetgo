'use client'

import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react'

import { errorMessage, payloadClient } from '@/lib/client/payload-client'
import type { UserDTO } from '@/lib/client/payload-types'

import type { WorkspaceSelectionContextValue } from './workspace-context'
import {
  buildWorkspaceSummaries,
  chooseSelectedWorkspaceId,
  readStoredWorkspaceId,
  storeWorkspaceId,
  type WorkspaceSummary,
  WORKSPACE_STORAGE_KEY,
} from './workspace-selection'

export function useWorkspaceController(user: UserDTO | null) {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([])
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const load = useCallback(async () => {
    if (!user) {
      setWorkspaces([])
      setSelectedWorkspaceId(null)
      setError(null)
      setIsLoading(false)
      return
    }

    setError(null)
    setIsLoading(true)
    try {
      const [workspaceResponse, membershipResponse] = await Promise.all([
        payloadClient.listWorkspaces(),
        payloadClient.listOrganizationMemberships({
          depth: 0,
          userId: String(user.id),
        }),
      ])
      const summaries = buildWorkspaceSummaries(
        workspaceResponse.docs,
        membershipResponse.docs,
        user.role === 'super-admin',
      )
      const selectedId = chooseSelectedWorkspaceId(summaries, readStoredWorkspaceId())
      setWorkspaces(summaries)
      setSelectedWorkspaceId(selectedId)
      storeWorkspaceId(selectedId)
    } catch (requestError) {
      setError(errorMessage(requestError))
      setWorkspaces([])
      setSelectedWorkspaceId(null)
    } finally {
      setIsLoading(false)
    }
  }, [user])

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timeout)
  }, [load])

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== WORKSPACE_STORAGE_KEY) return
      const nextId = chooseSelectedWorkspaceId(workspaces, event.newValue)
      setSelectedWorkspaceId(nextId)
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [workspaces])

  const selectedWorkspace =
    workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null

  const context = useMemo<WorkspaceSelectionContextValue>(
    () => ({
      isReady: Boolean(user) && !isLoading && !error,
      selectedWorkspace,
      selectedWorkspaceId,
      workspaces,
    }),
    [error, isLoading, selectedWorkspace, selectedWorkspaceId, user, workspaces],
  )

  return {
    context,
    error,
    isReady: Boolean(user) && !isLoading && !error,
    onChange: (event: ChangeEvent<HTMLSelectElement>) => {
      const nextId = chooseSelectedWorkspaceId(workspaces, event.target.value)
      setSelectedWorkspaceId(nextId)
      storeWorkspaceId(nextId)
    },
    onRetry: () => void load(),
    options: workspaces.map((workspace) => ({
      id: workspace.id,
      label: workspace.organizationName
        ? `${workspace.name} · ${workspace.organizationName}`
        : workspace.name,
    })),
    selectedRole: selectedWorkspace?.role.replace('-', ' ') ?? '',
    selectedSlug: selectedWorkspace?.slug ?? '',
    selectedWorkspaceId: selectedWorkspaceId ?? '',
  }
}
