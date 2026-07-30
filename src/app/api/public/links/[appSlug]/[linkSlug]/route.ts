import { after, NextResponse } from 'next/server'

import { publicReadHeaders } from '@/lib/domain/public-read-headers'
import { requestHostname } from '@/lib/domain/request-host'
import { getServerEnvironment } from '@/lib/server/env'
import {
  admitPublicLinkResolution,
  admitResolvedLinkEvent,
  publicLinkEventClientKey,
} from '@/lib/server/link-event-rate-limit'
import { linkEventResourceKey, mintLinkEventToken } from '@/lib/server/link-event-token'
import { inferPlatform, recordLinkEvent } from '@/lib/server/record-link-event'
import { resolvePublicHost } from '@/lib/server/resolve-public-host'
import { resolvePublicLink } from '@/lib/server/resolve-public-link'

type RouteContext = {
  params: Promise<{
    appSlug: string
    linkSlug: string
  }>
}

export const GET = async (request: Request, context: RouteContext): Promise<NextResponse> => {
  const { appSlug, linkSlug } = await context.params
  const environment = getServerEnvironment()
  const requestedHost = requestHostname(request.headers, environment.trustProxyHostHeader)
  if (!requestedHost.ok) {
    return NextResponse.json(
      {
        status: 'unavailable',
        error: { code: 'INVALID_HOST', message: 'The request host is invalid.' },
      },
      {
        status: 400,
        headers: { ...publicReadHeaders, 'Cache-Control': 'no-store' },
      },
    )
  }

  const clientKey = publicLinkEventClientKey(request)
  const requestAdmission = await admitPublicLinkResolution({
    appSlug,
    clientRateLimit: environment.trustProxyClientIPHeader,
    clientKey,
    eventHashSecret: environment.eventHashSecret,
    hostname: requestedHost.hostname,
    linkSlug,
  })
  if (!requestAdmission.allowed) {
    return NextResponse.json(
      {
        status: 'unavailable',
        error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again shortly.' },
      },
      {
        status: 429,
        headers: {
          ...publicReadHeaders,
          'Cache-Control': 'no-store',
          'Retry-After': '60',
        },
      },
    )
  }

  const host = await resolvePublicHost(request, 'resolver')
  if (!host.ok) {
    return NextResponse.json(
      {
        status: 'unavailable',
        error: {
          code: host.code,
          message:
            host.code === 'INVALID_HOST'
              ? 'The request host is invalid.'
              : 'This LinksetGo hostname is not active.',
        },
      },
      {
        status: host.httpStatus,
        headers: { ...publicReadHeaders, 'Cache-Control': 'no-store' },
      },
    )
  }

  const result = await resolvePublicLink({
    appSlug,
    baseURL: host.baseURL,
    linkSlug,
    pathStyle: host.pathStyle,
    ...(host.workspaceID ? { workspaceID: host.workspaceID } : {}),
  })

  if (result.ok) {
    const userAgent = request.headers.get('user-agent')
    after(async () => {
      const eventAdmission = await admitResolvedLinkEvent({
        clientKey,
        eventHashSecret: environment.eventHashSecret,
        resourceKey: linkEventResourceKey(
          result.internal.appID,
          result.internal.linkID,
          environment.eventHashSecret,
        ),
      }).catch(() => ({ allowed: false as const, reason: 'duplicate' as const }))
      if (eventAdmission.allowed) {
        await recordLinkEvent({
          admission: eventAdmission.grant,
          appID: result.internal.appID,
          hostname: host.hostname,
          linkID: result.internal.linkID,
          platform: inferPlatform(userAgent),
          ...(request.headers.get('referer')
            ? { referrer: request.headers.get('referer') as string }
            : {}),
        }).catch(() => false)
      }
    })
  }

  const body = result.ok
    ? {
        ...result.body,
        eventToken: mintLinkEventToken({
          appID: result.internal.appID,
          appSlug,
          eventHashSecret: environment.eventHashSecret,
          hostname: host.ok ? host.hostname : requestedHost.hostname,
          linkID: result.internal.linkID,
          linkSlug,
        }),
      }
    : result.body

  return NextResponse.json(body, {
    status: result.httpStatus,
    headers: {
      ...publicReadHeaders,
      'Cache-Control': 'no-store',
    },
  })
}
