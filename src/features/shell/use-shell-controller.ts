'use client'

import { usePathname, useRouter } from 'next/navigation'
import { type ChangeEvent, type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'

import { errorMessage, isUnauthorized, payloadClient } from '@/lib/client/payload-client'
import type { UserDTO } from '@/lib/client/payload-types'
import { useWorkspaceController } from '@/features/workspaces/use-workspace-controller'

const navigation = [
  { href: '/admin', icon: 'overview', label: 'Overview' },
  { href: '/admin/apps', icon: 'apps', label: 'Apps' },
  { href: '/admin/links', icon: 'links', label: 'Links' },
  { href: '/admin/domains', icon: 'domains', label: 'Domains' },
  { href: '/admin/fallback-origins', icon: 'domains', label: 'Fallback origins' },
  { href: '/admin/test-lab', icon: 'test', label: 'Test Lab' },
  { href: '/admin/team', icon: 'team', label: 'Team' },
  { href: '/admin/settings', icon: 'settings', label: 'Settings' },
] as const

function getPageName(pathname: string) {
  return (
    navigation.find((item) =>
      item.href === '/admin' ? pathname === item.href : pathname.startsWith(item.href),
    )?.label ?? 'Overview'
  )
}

function getUserName(user: UserDTO | null) {
  if (!user) return 'LinksetGo admin'
  return user.name?.trim() || user.email.split('@')[0] || 'LinksetGo admin'
}

function getInitials(name: string) {
  return name
    .split(/[\s._-]+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

export function useShellController() {
  const pathname = usePathname()
  const router = useRouter()
  const [user, setUser] = useState<UserDTO | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [search, setSearch] = useState('')
  const workspace = useWorkspaceController(user)

  const checkAuth = useCallback(async () => {
    setIsCheckingAuth(true)
    setAuthError(null)
    try {
      const response = await payloadClient.getCurrentUser()
      if (!response.user) {
        router.replace('/admin/login')
        return
      }
      setUser(response.user)
    } catch (error) {
      if (isUnauthorized(error)) {
        router.replace('/admin/login')
        return
      }
      setAuthError(errorMessage(error))
    } finally {
      setIsCheckingAuth(false)
    }
  }, [router])

  useEffect(() => {
    const timeout = window.setTimeout(() => void checkAuth(), 0)
    return () => window.clearTimeout(timeout)
  }, [checkAuth])

  const userName = getUserName(user)
  const items = useMemo(
    () =>
      navigation.map((item) => ({
        ...item,
        active: item.href === '/admin' ? pathname === item.href : pathname.startsWith(item.href),
        onNavigate: () => setIsMobileMenuOpen(false),
      })),
    [pathname],
  )

  return {
    authError: authError ?? workspace.error,
    currentPage: getPageName(pathname),
    environment: process.env.NEXT_PUBLIC_APP_ENV ?? 'Development',
    isMobileMenuOpen,
    isReady: !isCheckingAuth && Boolean(user) && workspace.isReady,
    navigation: items,
    onCloseMobileMenu: () => setIsMobileMenuOpen(false),
    onCreateLink: () => router.push('/admin/links#quick-link-title'),
    onLogout: async () => {
      await payloadClient.logout().catch(() => undefined)
      router.replace('/admin/login')
      router.refresh()
    },
    onRetryAuth: authError ? () => void checkAuth() : workspace.onRetry,
    onSearchChange: (event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value),
    onSearchSubmit: (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const query = search.trim()
      router.push(query ? `/admin/links?q=${encodeURIComponent(query)}` : '/admin/links')
    },
    onToggleMobileMenu: () => setIsMobileMenuOpen((value) => !value),
    onWorkspaceChange: workspace.onChange,
    search,
    selectedWorkspaceId: workspace.selectedWorkspaceId,
    userEmail: user?.email ?? '',
    userInitials: getInitials(userName),
    userName,
    workspaceContext: workspace.context,
    workspaceOptions: workspace.options,
    workspaceRole: workspace.selectedRole,
    workspaceSlug: workspace.selectedSlug,
  }
}
