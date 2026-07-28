'use client'

import { useCallback, useEffect, useState } from 'react'

import { errorMessage, payloadClient } from '@/lib/client/payload-client'
import type { AppDTO, DeepLinkDTO } from '@/lib/client/payload-types'

export function useLinkCatalog(
  appFilter: string,
  page: number,
  search: string,
  statusFilter: string,
  workspaceID: string | null,
  onAppsLoaded: (apps: readonly AppDTO[]) => void,
) {
  const [apps, setApps] = useState<AppDTO[]>([])
  const [links, setLinks] = useState<DeepLinkDTO[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [totalLinks, setTotalLinks] = useState(0)
  const [totalPages, setTotalPages] = useState(1)

  const load = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    if (!workspaceID) {
      setApps([])
      setLinks([])
      setTotalLinks(0)
      setTotalPages(1)
      setError('No workspace is available for this account.')
      setIsLoading(false)
      return
    }
    try {
      const appsResponse = await payloadClient.listApps({
        workspaceId: workspaceID,
      })
      const appIds = appsResponse.docs.map((app) => app.id)
      const linksResponse =
        appIds.length > 0
          ? await payloadClient.listDeepLinksPage({
              ...(appFilter ? { appId: appFilter } : { appIds }),
              page,
              search,
              status: statusFilter,
            })
          : null
      setApps(appsResponse.docs)
      setLinks(linksResponse?.docs ?? [])
      setTotalLinks(linksResponse?.totalDocs ?? 0)
      setTotalPages(Math.max(linksResponse?.totalPages ?? 1, 1))
      onAppsLoaded(appsResponse.docs)
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setIsLoading(false)
    }
  }, [appFilter, onAppsLoaded, page, search, statusFilter, workspaceID])

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timeout)
  }, [load])

  return { apps, error, isLoading, links, load, totalLinks, totalPages }
}
