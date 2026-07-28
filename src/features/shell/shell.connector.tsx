'use client'

import type { ReactNode } from 'react'

import { WorkspaceSelectionProvider } from '@/features/workspaces/workspace-context'

import { ShellView } from './shell.view'
import { useShellController } from './use-shell-controller'

export function ShellConnector({ children }: { children: ReactNode }) {
  const { workspaceContext, ...viewProps } = useShellController()
  return (
    <WorkspaceSelectionProvider value={workspaceContext}>
      <ShellView {...viewProps}>{children}</ShellView>
    </WorkspaceSelectionProvider>
  )
}
