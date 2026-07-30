import { NextResponse } from 'next/server'
import { createLocalReq } from 'payload'

import { MAX_QUICK_LINK_BODY_BYTES, parseQuickLinkInput } from '@/lib/domain/quick-link'
import { readBoundedJSON } from '@/lib/server/bounded-json'
import { isActiveConsoleUser } from '@/lib/server/domain-console'
import { getServerEnvironment } from '@/lib/server/env'
import { getPayloadClient } from '@/lib/server/payload-client'
import { rateLimitQuickLinkCreation } from '@/lib/server/quick-link-rate-limit'
import { createQuickLink } from '@/lib/server/quick-link-service'
import { isSameOriginMutation } from '@/lib/server/same-origin-mutation'
import { canAccessWorkspace } from '@/lib/server/tenant-context'

const headers = { 'Cache-Control': 'private, no-store' }

const error = (code: string, message: string, status: number): NextResponse =>
  NextResponse.json({ error: { code, message } }, { headers, status })

export async function POST(request: Request): Promise<NextResponse> {
  if (!isSameOriginMutation(request)) {
    return error('CROSS_SITE_REQUEST', 'This request is not allowed.', 403)
  }

  const payload = await getPayloadClient()
  const auth = await payload.auth({ headers: request.headers })
  if (!isActiveConsoleUser(auth.user)) {
    return error('UNAUTHORIZED', 'Sign in to create a link.', 401)
  }

  const body = await readBoundedJSON(request, MAX_QUICK_LINK_BODY_BYTES)
  if (!body.ok) {
    return error('INVALID_INPUT', 'The link request could not be processed.', body.status)
  }
  const parsed = parseQuickLinkInput(body.value)
  if (!parsed.ok) {
    return NextResponse.json(
      { error: { code: 'INVALID_INPUT', field: parsed.field, message: parsed.message } },
      { headers, status: 400 },
    )
  }

  const authorizationRequest = await createLocalReq({ user: auth.user }, payload)
  if (!(await canAccessWorkspace(authorizationRequest, parsed.value.workspaceId, 'manage'))) {
    return error('FORBIDDEN', 'Select a workspace you are allowed to manage.', 403)
  }

  const limit = await rateLimitQuickLinkCreation({
    actorID: String(auth.user.id),
    eventHashSecret: getServerEnvironment().eventHashSecret,
    workspaceID: parsed.value.workspaceId,
  })
  if (!limit.allowed) {
    const seconds = Math.max(1, Math.ceil((Date.parse(limit.resetAt) - Date.now()) / 1_000))
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many link requests. Try again later.' } },
      {
        headers: { ...headers, 'Retry-After': String(seconds) },
        status: 429,
      },
    )
  }

  const result = await createQuickLink({
    data: parsed.value,
    payload,
    user: auth.user,
  })
  return result.ok
    ? NextResponse.json(result.value, { headers, status: 201 })
    : error(result.code, result.message, result.status)
}
