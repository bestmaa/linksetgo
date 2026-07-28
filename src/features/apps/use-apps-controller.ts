'use client'

import { useRouter } from 'next/navigation'
import { type ChangeEvent, useCallback, useEffect, useState } from 'react'

import { useWorkspaceSelection } from '@/features/workspaces/workspace-context'
import { errorMessage, payloadClient } from '@/lib/client/payload-client'
import type { AppDTO } from '@/lib/client/payload-types'

import type { AppCardViewModel } from './apps.types'

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

function appCard(app: AppDTO, linkCount: number): AppCardViewModel {
  const platformNames: string[] = []
  if (app.iosBundleId) platformNames.push('iOS')
  if (app.androidPackageName) platformNames.push('Android')
  const status = app.status ?? 'draft'
  return {
    description: app.description?.trim() || 'No description has been added yet.',
    href: `/admin/apps/${encodeURIComponent(String(app.id))}`,
    id: String(app.id),
    initials: initials(app.name),
    linkCountLabel: `${linkCount} ${linkCount === 1 ? 'link' : 'links'}`,
    name: app.name,
    platforms: platformNames,
    slug: app.slug,
    status,
    statusTone: status === 'active' ? 'success' : status === 'paused' ? 'warning' : 'neutral',
  }
}

export function useAppsController() {
  const router = useRouter()
  const { isReady: isWorkspaceReady, selectedWorkspaceId } = useWorkspaceSelection()
  const [apps, setApps] = useState<AppDTO[]>([])
  const [linkCounts, setLinkCounts] = useState<Record<string, number>>({})
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const load = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    if (!isWorkspaceReady) return
    if (!selectedWorkspaceId) {
      setApps([])
      setLinkCounts({})
      setIsLoading(false)
      return
    }
    try {
      const appsResponse = await payloadClient.listApps({ workspaceId: selectedWorkspaceId })
      const counts = await Promise.all(
        appsResponse.docs.map(async (app) => ({
          count: (await payloadClient.listDeepLinks({ appId: String(app.id), limit: 1 })).totalDocs,
          id: String(app.id),
        })),
      )
      setApps(appsResponse.docs)
      setLinkCounts(Object.fromEntries(counts.map(({ count, id }) => [id, count])))
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setIsLoading(false)
    }
  }, [isWorkspaceReady, selectedWorkspaceId])

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timeout)
  }, [load])
  const visibleApps = apps.filter((app) => {
    const query = search.toLowerCase().trim()
    return (
      !query || app.name.toLowerCase().includes(query) || app.slug.toLowerCase().includes(query)
    )
  })

  return {
    apps: visibleApps.map((app) => appCard(app, linkCounts[String(app.id)] ?? 0)),
    error,
    isLoading,
    onCreate: () => router.push('/admin/apps/new'),
    onRetry: () => void load(),
    onSearchChange: (event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value),
    search,
  }
}
