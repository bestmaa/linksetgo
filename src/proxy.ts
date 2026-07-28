import { type NextRequest, NextResponse } from 'next/server'

import {
  decideDeploymentSurface,
  getDeploymentSurfaceConfig,
} from '@/lib/domain/deployment-surface'
import { requestHostname } from '@/lib/domain/request-host'

const unavailable = (request: NextRequest, status = 404): NextResponse => {
  const isAPI = request.nextUrl.pathname.startsWith('/api/')
  return isAPI
    ? NextResponse.json({ status: 'unavailable', error: { code: 'UNRECOGNIZED_HOST' } }, { status })
    : new NextResponse('Not Found', {
        status,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
}

export function proxy(request: NextRequest): NextResponse {
  const host = requestHostname(
    request.headers,
    process.env.TRUST_PROXY_HOST_HEADER?.trim().toLowerCase() === 'true',
  )
  if (!host.ok) return unavailable(request, 400)

  const decision = decideDeploymentSurface({
    config: getDeploymentSurfaceConfig(),
    hostname: host.hostname,
    method: request.method,
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
  })

  if (decision.kind === 'allow') return NextResponse.next()
  if (decision.kind === 'deny') return unavailable(request)
  return NextResponse.redirect(new URL(decision.destination, request.url))
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
}
