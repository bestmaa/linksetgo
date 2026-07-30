import 'server-only'

import type { LinkEvent } from '@/payload-types'
import { getServerEnvironment } from './env'
import type { LinkEventAdmissionGrant } from './link-event-rate-limit'
import { linkEventResourceKey } from './link-event-token'
import { getPayloadClient } from './payload-client'
import { privacySafeHash } from './request-privacy'
import { canRecordDetailedAnalytics, meterResolvedApp } from './resolution-metering'

export type PublicEventType = LinkEvent['eventType']
export type PublicEventPlatform = LinkEvent['platform']

type RecordEventInput = {
  admission: LinkEventAdmissionGrant
  appID: number
  hostname?: string
  linkID: number
  platform: PublicEventPlatform
  referrer?: string
}

type RecordEventDependencies = {
  now?: () => Date
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

export const inferPlatform = (userAgent: string | null): PublicEventPlatform => {
  if (!userAgent) return 'unknown'
  if (/android/i.test(userAgent)) return 'android'
  if (/(iphone|ipad|ipod)/i.test(userAgent)) return 'ios'
  return 'web'
}

export const recordLinkEvent = async (
  { admission, appID, hostname, linkID, platform, referrer }: RecordEventInput,
  dependencies: RecordEventDependencies = {},
): Promise<boolean> => {
  const environment = getServerEnvironment()
  if (linkEventResourceKey(appID, linkID, environment.eventHashSecret) !== admission.resourceKey) {
    return false
  }
  const payload = await getPayloadClient()
  const now = dependencies.now?.() ?? new Date()
  const analyticsAllowed =
    admission.eventType === 'resolved'
      ? (await meterResolvedApp(payload, appID, now)).allowDetailedAnalytics
      : await canRecordDetailedAnalytics(payload, appID, now)
  if (!analyticsAllowed) return false

  const safeReferrer = referrerOrigin(referrer)
  const sessionHash = privacySafeHash(
    `analytics-session:${admission.clientKey}`,
    environment.eventHashSecret,
  )

  await payload.create({
    collection: 'link-events',
    overrideAccess: true,
    data: {
      app: appID,
      link: linkID,
      eventType: admission.eventType,
      ...(hostname ? { hostname: limited(hostname, 253) } : {}),
      platform,
      sessionHash,
      occurredAt: now.toISOString(),
      ...(safeReferrer ? { referrer: limited(safeReferrer, 2048) } : {}),
    },
  })

  return true
}
