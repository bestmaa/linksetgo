'use client'

import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react'

import { errorMessage, payloadClient } from '@/lib/client/payload-client'
import type { AnalyticsQueryInput, AnalyticsSummaryDTO } from '@/lib/client/payload-types'

import { presentLinkAnalytics } from './link-detail.presenter'

const dateLabel = (date: Date): string => date.toISOString().slice(0, 10)

function defaultRange() {
  const today = new Date()
  const from = new Date(today)
  from.setUTCDate(today.getUTCDate() - 6)
  return { from: dateLabel(from), to: dateLabel(today) }
}

type AnalyticsState =
  | { kind: 'idle' }
  | { kind: 'loading'; scope: string }
  | { kind: 'ready'; scope: string; summary: AnalyticsSummaryDTO }
  | { error: string; kind: 'error'; scope: string }

export function useLinkAnalytics(linkID: string, workspaceID: string | null, enabled: boolean) {
  const initialRange = defaultRange()
  const [from, setFrom] = useState(initialRange.from)
  const [to, setTo] = useState(initialRange.to)
  const [platform, setPlatform] = useState('')
  const [eventType, setEventType] = useState('')
  const [state, setState] = useState<AnalyticsState>({ kind: 'idle' })
  const query = useMemo<AnalyticsQueryInput | null>(
    () =>
      workspaceID && enabled
        ? {
            from,
            linkId: linkID,
            to,
            workspaceId: workspaceID,
            ...(eventType ? { eventType } : {}),
            ...(platform ? { platform } : {}),
          }
        : null,
    [enabled, eventType, from, linkID, platform, to, workspaceID],
  )
  const scope = query ? JSON.stringify(query) : ''

  const load = useCallback(async () => {
    if (!query) return
    setState({ kind: 'loading', scope })
    try {
      setState({
        kind: 'ready',
        scope,
        summary: await payloadClient.getAnalyticsSummary(query),
      })
    } catch (requestError) {
      setState({ error: errorMessage(requestError), kind: 'error', scope })
    }
  }, [query, scope])

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timeout)
  }, [load])

  const current = state.kind !== 'idle' && state.scope === scope ? state : null
  const summary = current?.kind === 'ready' ? current.summary : null
  const error = current?.kind === 'error' ? current.error : null
  const exportHref = query ? payloadClient.getAnalyticsExportURL(query) : null
  const view = presentLinkAnalytics({
    error,
    eventType,
    exportHref,
    from,
    isLoading: !current || current.kind === 'loading',
    platform,
    summary,
    to,
  })

  return {
    onEventChange: (event: ChangeEvent<HTMLSelectElement>) => setEventType(event.target.value),
    onFromChange: (event: ChangeEvent<HTMLInputElement>) => setFrom(event.target.value),
    onPlatformChange: (event: ChangeEvent<HTMLSelectElement>) => setPlatform(event.target.value),
    onRetry: () => void load(),
    onToChange: (event: ChangeEvent<HTMLInputElement>) => setTo(event.target.value),
    view,
  }
}
