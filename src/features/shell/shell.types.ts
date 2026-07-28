import type { ChangeEventHandler, FormEventHandler, MouseEventHandler, ReactNode } from 'react'

import type { IconName } from '@/components/ui/icon'

export type NavigationItem = {
  active: boolean
  href: string
  icon: IconName
  label: string
  onNavigate: MouseEventHandler<HTMLAnchorElement>
}

export type WorkspaceOption = {
  id: string
  label: string
}

export type ShellViewProps = {
  authError: string | null
  children: ReactNode
  currentPage: string
  environment: string
  isMobileMenuOpen: boolean
  isReady: boolean
  navigation: readonly NavigationItem[]
  onCloseMobileMenu: () => void
  onCreateLink: () => void
  onLogout: () => void
  onRetryAuth: () => void
  onSearchChange: ChangeEventHandler<HTMLInputElement>
  onSearchSubmit: FormEventHandler<HTMLFormElement>
  onToggleMobileMenu: () => void
  onWorkspaceChange: ChangeEventHandler<HTMLSelectElement>
  search: string
  selectedWorkspaceId: string
  userEmail: string
  userInitials: string
  userName: string
  workspaceOptions: readonly WorkspaceOption[]
  workspaceRole: string
  workspaceSlug: string
}
