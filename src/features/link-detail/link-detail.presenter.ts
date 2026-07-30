import type { AnalyticsSummaryDTO, LinkConsoleDetailDTO } from '@/lib/client/payload-types'
import { nativeSchemeURL } from '@/lib/domain/native-scheme'
import { buildPublicURL } from '@/lib/domain/public-link'
import type { PublicLinkPathStyle } from '@/lib/domain/runtime-link-config'

import type { LinkAnalyticsViewModel, LinkDetailViewModel } from './link-detail.types'

export function publicURLForLink(
  detail: LinkConsoleDetailDTO | null,
  baseURL: string | null,
  pathStyle: PublicLinkPathStyle = 'host-scoped',
): string | null {
  if (!detail || !baseURL) return null
  const appKey = pathStyle === 'shared-clean' ? detail.app.publicKey : detail.app.slug
  return appKey ? buildPublicURL(baseURL, appKey, detail.link.slug, pathStyle) : null
}

export function presentLinkDetail(input: {
  baseURL: string | null
  canManage: boolean
  detail: LinkConsoleDetailDTO
  pathStyle: PublicLinkPathStyle
  qrDataURL: string | null
  qrError: string | null
}): LinkDetailViewModel {
  const publicURL = publicURLForLink(input.detail, input.baseURL, input.pathStyle)
  const status = input.detail.effectiveStatus
  return {
    appName: input.detail.app.name,
    appStatus: input.detail.app.status,
    canManage: input.canManage,
    effectiveStatus: status,
    linkKey: input.detail.link.slug,
    name: input.detail.link.name,
    nativeURL: input.detail.app.nativeScheme
      ? nativeSchemeURL(input.detail.app.nativeScheme, input.detail.link.destinationPath)
      : null,
    publicURL,
    qrDataURL: input.qrDataURL,
    qrError: input.qrError,
    statusTone:
      status === 'active'
        ? 'success'
        : status === 'expired'
          ? 'danger'
          : status === 'paused'
            ? 'warning'
            : 'neutral',
    testHref: publicURL ? `/admin/test-lab?url=${encodeURIComponent(publicURL)}` : null,
  }
}

export function presentLinkAnalytics(input: {
  error: string | null
  eventType: string
  exportHref: string | null
  from: string
  isLoading: boolean
  platform: string
  summary: AnalyticsSummaryDTO | null
  to: string
}): LinkAnalyticsViewModel {
  const maximum = Math.max(...(input.summary?.daily.map((row) => row.count) ?? []), 1)
  const range = input.summary?.range
  return {
    daily:
      input.summary?.daily.map((row) => ({
        ...row,
        height: row.count === 0 ? '0%' : `${Math.max(8, Math.round((row.count / maximum) * 100))}%`,
      })) ?? [],
    error: input.error,
    eventType: input.eventType,
    events: input.summary?.events ?? [],
    exportHref: input.exportHref,
    from: input.from,
    hosts: input.summary?.hosts ?? [],
    isLoading: input.isLoading,
    platform: input.platform,
    platforms: input.summary?.platforms ?? [],
    retentionNote: range
      ? `${range.retentionDays}-day retention${range.wasClamped ? `; range starts ${range.from}` : ''}`
      : 'Loading retention policy…',
    to: input.to,
    totalEvents: (input.summary?.totalEvents ?? 0).toLocaleString(),
  }
}
