import { NextResponse } from 'next/server'

import {
  MAX_FALLBACK_ORIGIN_REQUEST_BYTES,
  parseFallbackOriginAction,
} from '@/lib/domain/fallback-origin-console-input'
import { readBoundedJSON } from '@/lib/server/bounded-json'
import { isActiveConsoleUser } from '@/lib/server/domain-console'
import {
  normalizeFallbackOriginID,
  runConsoleFallbackOriginAction,
} from '@/lib/server/fallback-origin-console'
import { getFallbackOriginDNSProviderConfiguration } from '@/lib/server/fallback-origin-dns-webhook'
import { rateLimitFallbackOriginAction } from '@/lib/server/fallback-origin-rate-limit'
import { getServerEnvironment } from '@/lib/server/env'
import { getPayloadClient } from '@/lib/server/payload-client'
import { isSameOriginMutation } from '@/lib/server/same-origin-mutation'

type RouteContext = {
  params: Promise<{ originId: string }>
}

const headers = { 'Cache-Control': 'private, no-store' }

export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json(
      { error: { code: 'CROSS_SITE_REQUEST', message: 'This request is not allowed.' } },
      { headers, status: 403 },
    )
  }
  const payload = await getPayloadClient()
  const auth = await payload.auth({ headers: request.headers })
  if (!isActiveConsoleUser(auth.user)) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Sign in to manage fallback origins.' } },
      { headers, status: 401 },
    )
  }

  const { originId } = await context.params
  const id = normalizeFallbackOriginID(originId)
  const body = await readBoundedJSON(request, MAX_FALLBACK_ORIGIN_REQUEST_BYTES)
  const parsed = body.ok ? parseFallbackOriginAction(body.value) : null
  if (!id || !body.ok || !parsed?.ok) {
    return NextResponse.json(
      { error: { code: 'INVALID_INPUT', message: 'Select one valid fallback-origin action.' } },
      { headers, status: body.ok ? 400 : body.status },
    )
  }

  const limit = await rateLimitFallbackOriginAction({
    actorID: String(auth.user.id),
    eventHashSecret: getServerEnvironment().eventHashSecret,
    originID: id,
  })
  if (!limit.allowed) {
    const seconds = Math.max(1, Math.ceil((Date.parse(limit.resetAt) - Date.now()) / 1_000))
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many actions. Try again later.' } },
      { headers: { ...headers, 'Retry-After': String(seconds) }, status: 429 },
    )
  }

  const result = await runConsoleFallbackOriginAction({
    action: parsed.action,
    id,
    payload,
    provider: getFallbackOriginDNSProviderConfiguration(),
    user: auth.user,
    workspaceID: parsed.workspaceID,
  })
  return result.ok
    ? NextResponse.json(result.value, { headers })
    : NextResponse.json(
        { error: { code: result.code, message: result.message } },
        { headers, status: result.status },
      )
}
