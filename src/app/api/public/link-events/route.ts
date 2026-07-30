import { NextResponse } from 'next/server'

import { isPublicSlug } from '@/lib/domain/public-link'
import { requestHostname } from '@/lib/domain/request-host'
import { readBoundedJSON } from '@/lib/server/bounded-json'
import { getServerEnvironment } from '@/lib/server/env'
import {
  admitInteractionLinkEvent,
  publicLinkEventClientKey,
} from '@/lib/server/link-event-rate-limit'
import { linkEventResourceKey, verifyLinkEventToken } from '@/lib/server/link-event-token'
import {
  inferPlatform,
  recordLinkEvent,
  type PublicEventType,
} from '@/lib/server/record-link-event'
import { resolvePublicHost } from '@/lib/server/resolve-public-host'
import { resolvePublicLink } from '@/lib/server/resolve-public-link'

const MAX_EVENT_BODY_BYTES = 4096
type InteractionEventType = Exclude<PublicEventType, 'resolved'>

const ALLOWED_EVENTS = new Set<InteractionEventType>([
  'app-opened',
  'fallback-viewed',
  'open-app-clicked',
  'store-clicked',
])

const isCanonicalEventSlug = (value: string): boolean => value.length <= 80 && isPublicSlug(value)

type EventBody = {
  appSlug: string
  eventToken: string
  eventType: InteractionEventType
  linkSlug: string
}

const parseBody = (value: unknown): EventBody | null => {
  if (typeof value !== 'object' || value === null) return null

  const body = value as Record<string, unknown>
  const allowedKeys = new Set(['appSlug', 'eventToken', 'eventType', 'linkSlug', 'sessionID'])
  if (
    Object.keys(body).some((key) => !allowedKeys.has(key)) ||
    typeof body.appSlug !== 'string' ||
    typeof body.linkSlug !== 'string' ||
    typeof body.eventToken !== 'string' ||
    body.eventToken.length === 0 ||
    body.eventToken.length > 1_024 ||
    !isCanonicalEventSlug(body.appSlug) ||
    !isCanonicalEventSlug(body.linkSlug) ||
    typeof body.eventType !== 'string' ||
    !ALLOWED_EVENTS.has(body.eventType as InteractionEventType)
  ) {
    return null
  }

  if (body.sessionID !== undefined && typeof body.sessionID !== 'string') return null

  return {
    appSlug: body.appSlug,
    eventToken: body.eventToken,
    eventType: body.eventType as InteractionEventType,
    linkSlug: body.linkSlug,
  }
}

const invalidEvent = (status = 400): NextResponse =>
  NextResponse.json(
    { status: 'unavailable', error: { code: 'INVALID_EVENT', message: 'Invalid event.' } },
    { status },
  )

export const POST = async (request: Request): Promise<NextResponse> => {
  const boundedBody = await readBoundedJSON(request, MAX_EVENT_BODY_BYTES)
  const body = boundedBody.ok ? parseBody(boundedBody.value) : null
  if (!body) return invalidEvent(boundedBody.ok ? 400 : boundedBody.status)

  const environment = getServerEnvironment()
  const requestedHost = requestHostname(request.headers, environment.trustProxyHostHeader)
  if (!requestedHost.ok) return invalidEvent()

  const token = verifyLinkEventToken({
    appSlug: body.appSlug,
    eventHashSecret: environment.eventHashSecret,
    hostname: requestedHost.hostname,
    linkSlug: body.linkSlug,
    token: body.eventToken,
  })
  if (!token) return invalidEvent()

  const admission = await admitInteractionLinkEvent({
    clientRateLimit: environment.trustProxyClientIPHeader,
    clientKey: publicLinkEventClientKey(request),
    eventHashSecret: environment.eventHashSecret,
    eventType: body.eventType,
    resourceKey: token.resourceKey,
    tokenNonce: token.nonce,
    tokenWindowMs: Math.max(1_000, token.expiresAt - Date.now()),
  })
  if (!admission.allowed) {
    return NextResponse.json({ accepted: true }, { status: 202 })
  }

  const host = await resolvePublicHost(request, 'resolver')
  if (!host.ok) {
    return NextResponse.json(
      {
        status: 'unavailable',
        error: { code: host.code, message: 'This LinksetGo hostname is not active.' },
      },
      { status: host.httpStatus },
    )
  }

  const result = await resolvePublicLink({
    appSlug: body.appSlug,
    baseURL: host.baseURL,
    linkSlug: body.linkSlug,
    pathStyle: host.pathStyle,
    ...(host.workspaceID ? { workspaceID: host.workspaceID } : {}),
  })
  if (!result.ok) return NextResponse.json(result.body, { status: result.httpStatus })
  if (
    linkEventResourceKey(
      result.internal.appID,
      result.internal.linkID,
      environment.eventHashSecret,
    ) !== token.resourceKey ||
    host.hostname !== token.hostname
  ) {
    return invalidEvent()
  }

  const userAgent = request.headers.get('user-agent')
  await recordLinkEvent({
    admission: admission.grant,
    appID: result.internal.appID,
    hostname: host.hostname,
    linkID: result.internal.linkID,
    platform: inferPlatform(userAgent),
    ...(request.headers.get('referer')
      ? { referrer: request.headers.get('referer') as string }
      : {}),
  }).catch(() => false)

  return NextResponse.json({ accepted: true }, { status: 202 })
}
