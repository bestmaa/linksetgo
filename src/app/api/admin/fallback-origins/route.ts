import { NextResponse } from 'next/server'

import {
  MAX_FALLBACK_ORIGIN_REQUEST_BYTES,
  parseFallbackOriginRegistration,
} from '@/lib/domain/fallback-origin-console-input'
import { readBoundedJSON } from '@/lib/server/bounded-json'
import { isActiveConsoleUser, normalizeConsoleWorkspaceID } from '@/lib/server/domain-console'
import {
  listConsoleFallbackOrigins,
  registerConsoleFallbackOrigin,
} from '@/lib/server/fallback-origin-console'
import { getFallbackOriginDNSProviderConfiguration } from '@/lib/server/fallback-origin-dns-webhook'
import { rateLimitFallbackOriginRegistration } from '@/lib/server/fallback-origin-rate-limit'
import { getServerEnvironment } from '@/lib/server/env'
import { getPayloadClient } from '@/lib/server/payload-client'
import { isSameOriginMutation } from '@/lib/server/same-origin-mutation'

const headers = { 'Cache-Control': 'private, no-store' }

const unauthorized = (): NextResponse =>
  NextResponse.json(
    { error: { code: 'UNAUTHORIZED', message: 'Sign in to manage fallback origins.' } },
    { headers, status: 401 },
  )

function resultResponse<T>(
  result: { ok: true; value: T } | { code: string; message: string; ok: false; status: number },
  successStatus = 200,
): NextResponse {
  return result.ok
    ? NextResponse.json(result.value, { headers, status: successStatus })
    : NextResponse.json(
        { error: { code: result.code, message: result.message } },
        { headers, status: result.status },
      )
}

export async function GET(request: Request): Promise<NextResponse> {
  const payload = await getPayloadClient()
  const auth = await payload.auth({ headers: request.headers })
  if (!isActiveConsoleUser(auth.user)) return unauthorized()

  const workspaceID = normalizeConsoleWorkspaceID(
    new URL(request.url).searchParams.get('workspaceId'),
  )
  if (!workspaceID) {
    return NextResponse.json(
      { error: { code: 'INVALID_INPUT', message: 'Select a workspace.' } },
      { headers, status: 400 },
    )
  }
  return resultResponse(
    await listConsoleFallbackOrigins({
      payload,
      provider: getFallbackOriginDNSProviderConfiguration(),
      user: auth.user,
      workspaceID,
    }),
  )
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json(
      { error: { code: 'CROSS_SITE_REQUEST', message: 'This request is not allowed.' } },
      { headers, status: 403 },
    )
  }
  const payload = await getPayloadClient()
  const auth = await payload.auth({ headers: request.headers })
  if (!isActiveConsoleUser(auth.user)) return unauthorized()

  const body = await readBoundedJSON(request, MAX_FALLBACK_ORIGIN_REQUEST_BYTES)
  const parsed = body.ok ? parseFallbackOriginRegistration(body.value) : null
  if (!body.ok || !parsed?.ok) {
    return NextResponse.json(
      {
        error: {
          code: 'INVALID_INPUT',
          message: 'Enter one fallback hostname and select a workspace.',
        },
      },
      { headers, status: body.ok ? 400 : body.status },
    )
  }

  const limit = await rateLimitFallbackOriginRegistration({
    actorID: String(auth.user.id),
    eventHashSecret: getServerEnvironment().eventHashSecret,
    workspaceID: parsed.workspaceID,
  })
  if (!limit.allowed) {
    const seconds = Math.max(1, Math.ceil((Date.parse(limit.resetAt) - Date.now()) / 1_000))
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many registrations. Try again later.' } },
      { headers: { ...headers, 'Retry-After': String(seconds) }, status: 429 },
    )
  }

  return resultResponse(
    await registerConsoleFallbackOrigin({
      hostname: parsed.hostname,
      payload,
      user: auth.user,
      workspaceID: parsed.workspaceID,
    }),
    201,
  )
}
