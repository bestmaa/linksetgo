import 'server-only'

import type { AnalyticsQueryInput } from '@/lib/client/payload-types'

const allowedKeys = new Set([
  'appId',
  'eventType',
  'from',
  'hostname',
  'linkId',
  'platform',
  'to',
  'workspaceId',
])

export function analyticsQueryFromURL(url: string): AnalyticsQueryInput | null {
  const parameters = new URL(url).searchParams
  if ([...parameters.keys()].some((key) => !allowedKeys.has(key))) return null
  const workspaceId = parameters.get('workspaceId')?.trim()
  if (!workspaceId) return null

  const optional = (key: string): string | undefined => parameters.get(key)?.trim() || undefined
  const appId = optional('appId')
  const eventType = optional('eventType')
  const from = optional('from')
  const hostname = optional('hostname')
  const linkId = optional('linkId')
  const platform = optional('platform')
  const to = optional('to')
  return {
    workspaceId,
    ...(appId ? { appId } : {}),
    ...(eventType ? { eventType } : {}),
    ...(from ? { from } : {}),
    ...(hostname ? { hostname } : {}),
    ...(linkId ? { linkId } : {}),
    ...(platform ? { platform } : {}),
    ...(to ? { to } : {}),
  }
}
