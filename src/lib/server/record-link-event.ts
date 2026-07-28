import 'server-only'

import { createHmac, randomUUID } from 'node:crypto'

import {
  EVENT_DEDUPE_WINDOW_MS,
  EVENT_RATE_WINDOW_MS,
  shouldRecordLinkEvent,
} from '@/lib/domain/event-policy'
import type { LinkEvent } from '@/payload-types'
import { getServerEnvironment } from './env'
import { getPayloadClient } from './payload-client'
import { canRecordDetailedAnalytics } from './resolution-metering'

export type PublicEventType = LinkEvent['eventType']
export type PublicEventPlatform = LinkEvent['platform']

type RecordEventInput = {
  appID: number
  eventType: PublicEventType
  hostname?: string
  linkID: number
  platform: PublicEventPlatform
  referrer?: string
  sessionID?: string
  userAgent?: string
}

const limited = (value: string, maximum: number): string => value.slice(0, maximum)

const referrerOrigin = (referrer: string | undefined): string | undefined => {
  if (!referrer) return undefined
  try {
    return new URL(referrer).origin
  } catch {
    return undefined
  }
}

const hashSession = (sessionID: string): string => {
  const salt = getServerEnvironment().eventHashSecret
  return createHmac('sha256', salt).update(sessionID).digest('hex')
}

export const inferPlatform = (userAgent: string | null): PublicEventPlatform => {
  if (!userAgent) return 'unknown'
  if (/android/i.test(userAgent)) return 'android'
  if (/(iphone|ipad|ipod)/i.test(userAgent)) return 'ios'
  return 'web'
}

export const recordLinkEvent = async ({
  appID,
  eventType,
  hostname,
  linkID,
  platform,
  referrer,
  sessionID,
  userAgent,
}: RecordEventInput): Promise<boolean> => {
  const payload = await getPayloadClient()
  if (!(await canRecordDetailedAnalytics(payload, appID))) return false
  const safeReferrer = referrerOrigin(referrer)
  const sessionSource =
    sessionID ||
    (eventType === 'resolved'
      ? `resolution:${randomUUID()}`
      : `${platform}:${userAgent ?? ''}:${safeReferrer ?? ''}`)
  const sessionHash = hashSession(limited(sessionSource, 512))

  const duplicateSince = new Date(Date.now() - EVENT_DEDUPE_WINDOW_MS).toISOString()
  const duplicate = await payload.count({
    collection: 'link-events',
    overrideAccess: true,
    where: {
      and: [
        { link: { equals: linkID } },
        { eventType: { equals: eventType } },
        { sessionHash: { equals: sessionHash } },
        { occurredAt: { greater_than: duplicateSince } },
      ],
    },
  })
  const rateWindow = new Date(Date.now() - EVENT_RATE_WINDOW_MS).toISOString()
  const recent = await payload.count({
    collection: 'link-events',
    overrideAccess: true,
    where: {
      and: [{ sessionHash: { equals: sessionHash } }, { occurredAt: { greater_than: rateWindow } }],
    },
  })
  if (!shouldRecordLinkEvent(duplicate.totalDocs, recent.totalDocs)) return false

  await payload.create({
    collection: 'link-events',
    overrideAccess: true,
    data: {
      app: appID,
      link: linkID,
      eventType,
      ...(hostname ? { hostname: limited(hostname, 253) } : {}),
      platform,
      sessionHash,
      occurredAt: new Date().toISOString(),
      ...(safeReferrer ? { referrer: limited(safeReferrer, 2048) } : {}),
    },
  })

  return true
}
