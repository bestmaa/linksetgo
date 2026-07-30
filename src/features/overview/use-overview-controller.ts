'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

import { errorMessage, payloadClient } from '@/lib/client/payload-client'
import type { AppDTO, DeepLinkDTO } from '@/lib/client/payload-types'
import { useRuntimeLinkConfig } from '@/features/runtime-config/use-runtime-link-config'
import { useWorkspaceSelection } from '@/features/workspaces/workspace-context'

import {
  effectiveLinkStatus,
  presentOverviewHealth,
  presentOverviewRecentLink,
} from './overview.presenter'

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function dateLabel(date: Date) {
  return date.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2)
}

function createActivity(links: DeepLinkDTO[]) {
  const today = new Date()
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today)
    date.setHours(0, 0, 0, 0)
    date.setDate(today.getDate() - (6 - index))
    const next = new Date(date)
    next.setDate(date.getDate() + 1)
    const value = links.reduce((sum, link) => {
      const created = link.createdAt ? new Date(link.createdAt) : null
      return created && created >= date && created < next ? sum + 1 : sum
    }, 0)
    return { date, value }
  })
  const maximum = Math.max(...days.map((day) => day.value), 1)
  return days.map((day) => ({
    height: day.value === 0 ? '0%' : `${Math.max(8, Math.round((day.value / maximum) * 100))}%`,
    label: dateLabel(day.date),
    value: day.value,
  }))
}

export function useOverviewController() {
  const router = useRouter()
  const { selectedWorkspaceId } = useWorkspaceSelection()
  const runtimeConfig = useRuntimeLinkConfig(selectedWorkspaceId)
  const [apps, setApps] = useState<AppDTO[]>([])
  const [links, setLinks] = useState<DeepLinkDTO[]>([])
  const [trackedEvents, setTrackedEvents] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const load = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    setApps([])
    setLinks([])
    setTrackedEvents(0)
    if (!selectedWorkspaceId) {
      setError('No workspace is available for this account.')
      setIsLoading(false)
      return
    }
    try {
      const appsResponse = await payloadClient.listApps({ workspaceId: selectedWorkspaceId })
      const appIds = appsResponse.docs.map((app) => app.id)
      let linkDocs: DeepLinkDTO[] = []
      let eventCount = 0
      if (appIds.length > 0) {
        const [linksResponse, eventsResponse] = await Promise.all([
          payloadClient.listDeepLinks({ appIds }),
          payloadClient.listLinkEvents({ appIds }),
        ])
        linkDocs = linksResponse.docs
        eventCount = eventsResponse.totalDocs
      }
      setApps(appsResponse.docs)
      setLinks(linkDocs)
      setTrackedEvents(eventCount)
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setIsLoading(false)
    }
  }, [selectedWorkspaceId])

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timeout)
  }, [load])

  const activeLinks = links.filter((link) => effectiveLinkStatus(link) === 'active').length
  const readiness = links.length > 0 ? Math.round((activeLinks / links.length) * 100) : 0

  return {
    activity: createActivity(links),
    error,
    greeting: greeting(),
    health: presentOverviewHealth(apps, runtimeConfig.config, runtimeConfig.error),
    isLoading,
    metrics: [
      {
        icon: 'links' as const,
        label: 'Active links',
        note: `${links.length} total`,
        value: String(activeLinks),
      },
      {
        icon: 'apps' as const,
        label: 'Configured apps',
        note: 'Across both platforms',
        value: String(apps.length),
      },
      {
        icon: 'test' as const,
        label: 'Tracked events',
        note: 'Lifetime accepted events',
        value: trackedEvents.toLocaleString(),
      },
      {
        icon: 'check' as const,
        label: 'Link readiness',
        note: 'Active share of all links',
        value: `${readiness}%`,
      },
    ],
    onCreateLink: () => router.push('/admin/links#quick-link-title'),
    onRetry: () => void load(),
    recentLinks: links
      .slice(0, 5)
      .map((link) => presentOverviewRecentLink(link, runtimeConfig.config)),
  }
}
