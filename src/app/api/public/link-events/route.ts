import { NextResponse } from 'next/server'

import { isPublicSlug } from '@/lib/domain/public-link'
import { readBoundedJSON } from '@/lib/server/bounded-json'
import {
  inferPlatform,
  recordLinkEvent,
  type PublicEventType,
} from '@/lib/server/record-link-event'
import { getPayloadClient } from '@/lib/server/payload-client'
import { canRecordDetailedAnalytics } from '@/lib/server/resolution-metering'
import { resolvePublicHost } from '@/lib/server/resolve-public-host'
import { resolvePublicLink } from '@/lib/server/resolve-public-link'

const MAX_EVENT_BODY_BYTES = 4096
const ALLOWED_EVENTS = new Set<PublicEventType>([
  'app-opened',
  'fallback-viewed',
  'open-app-clicked',
  'store-clicked',
])

const isCanonicalEventSlug = (value: string): boolean => value.length <= 80 && isPublicSlug(value)

type EventBody = {
  appSlug: string
  eventType: PublicEventType
  linkSlug: string
  sessionID?: string
}

const parseBody = (value: unknown): EventBody | null => {
  if (typeof value !== 'object' || value === null) return null

  const body = value as Record<string, unknown>
  const allowedKeys = new Set(['appSlug', 'eventType', 'linkSlug', 'sessionID'])
  if (
    Object.keys(body).some((key) => !allowedKeys.has(key)) ||
    typeof body.appSlug !== 'string' ||
    typeof body.linkSlug !== 'string' ||
    !isCanonicalEventSlug(body.appSlug) ||
    !isCanonicalEventSlug(body.linkSlug) ||
    typeof body.eventType !== 'string' ||
    !ALLOWED_EVENTS.has(body.eventType as PublicEventType)
  ) {
    return null
  }

  if (body.sessionID !== undefined && typeof body.sessionID !== 'string') return null

  const parsed: EventBody = {
    appSlug: body.appSlug,
    eventType: body.eventType as PublicEventType,
    linkSlug: body.linkSlug,
  }
  return typeof body.sessionID === 'string'
    ? { ...parsed, sessionID: body.sessionID.slice(0, 128) }
    : parsed
}

export const POST = async (request: Request): Promise<NextResponse> => {
  const boundedBody = await readBoundedJSON(request, MAX_EVENT_BODY_BYTES)
  const body = boundedBody.ok ? parseBody(boundedBody.value) : null
  if (!body) {
    return NextResponse.json(
      { status: 'unavailable', error: { code: 'INVALID_EVENT', message: 'Invalid event.' } },
      { status: boundedBody.ok ? 400 : boundedBody.status },
    )
  }

  const host = await resolvePublicHost(request, 'resolver')
  if (!host.ok) {
    return NextResponse.json(
      {
        status: 'unavailable',
        error: { code: host.code, message: 'This Relay hostname is not active.' },
      },
      { status: host.httpStatus },
    )
  }

  const result = await resolvePublicLink({
    appSlug: body.appSlug,
    baseURL: host.baseURL,
    linkSlug: body.linkSlug,
    ...(host.workspaceID ? { workspaceID: host.workspaceID } : {}),
  })
  if (!result.ok) return NextResponse.json(result.body, { status: result.httpStatus })

  const analyticsAllowed = await getPayloadClient()
    .then((payload) => canRecordDetailedAnalytics(payload, result.internal.appID))
    .catch(() => false)
  if (!analyticsAllowed) return NextResponse.json({ accepted: true }, { status: 202 })

  const userAgent = request.headers.get('user-agent')
  await recordLinkEvent({
    ...result.internal,
    eventType: body.eventType,
    hostname: host.hostname,
    platform: inferPlatform(userAgent),
    ...(request.headers.get('referer')
      ? { referrer: request.headers.get('referer') as string }
      : {}),
    ...(body.sessionID ? { sessionID: body.sessionID } : {}),
    ...(userAgent ? { userAgent } : {}),
  })

  return NextResponse.json({ accepted: true }, { status: 202 })
}
