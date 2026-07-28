import { after, NextResponse } from 'next/server'

import { publicReadHeaders } from '@/lib/domain/public-read-headers'
import { inferPlatform, recordLinkEvent } from '@/lib/server/record-link-event'
import { getPayloadClient } from '@/lib/server/payload-client'
import { meterResolvedApp } from '@/lib/server/resolution-metering'
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
    ...(host.workspaceID ? { workspaceID: host.workspaceID } : {}),
  })

  if (result.ok) {
    const userAgent = request.headers.get('user-agent')
    after(async () => {
      const metering = await getPayloadClient()
        .then((payload) => meterResolvedApp(payload, result.internal.appID))
        .catch(() => null)
      if (metering?.allowDetailedAnalytics) {
        await recordLinkEvent({
          ...result.internal,
          eventType: 'resolved',
          hostname: host.hostname,
          platform: inferPlatform(userAgent),
          ...(request.headers.get('referer')
            ? { referrer: request.headers.get('referer') as string }
            : {}),
          ...(userAgent ? { userAgent } : {}),
        }).catch(() => false)
      }
    })
  }

  return NextResponse.json(result.body, {
    status: result.httpStatus,
    headers: {
      ...publicReadHeaders,
      'Cache-Control': 'no-store',
    },
  })
}
