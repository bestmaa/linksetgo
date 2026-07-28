'use client'

import { createContext, type ReactNode, useContext } from 'react'

import type { WorkspaceSummary } from './workspace-selection'

export type WorkspaceSelectionContextValue = {
  isReady: boolean
  selectedWorkspace: WorkspaceSummary | null
  selectedWorkspaceId: string | null
  workspaces: readonly WorkspaceSummary[]
}

const WorkspaceSelectionContext = createContext<WorkspaceSelectionContextValue | null>(null)

export function WorkspaceSelectionProvider({
  children,
  value,
}: {
  children: ReactNode
  value: WorkspaceSelectionContextValue
}) {
  return (
    <WorkspaceSelectionContext.Provider value={value}>
      {children}
    </WorkspaceSelectionContext.Provider>
  )
}

export function useWorkspaceSelection(): WorkspaceSelectionContextValue {
  const value = useContext(WorkspaceSelectionContext)
  if (!value) throw new Error('useWorkspaceSelection must be used inside the admin shell.')
  return value
}
