import { NextResponse } from 'next/server'

import {
  MAX_TEAM_INVITATION_BODY_BYTES,
  normalizeTeamIdentifier,
  parseTeamMemberMutation,
} from '@/lib/domain/team-invitations'
import { readBoundedJSON } from '@/lib/server/bounded-json'
import { getServerEnvironment } from '@/lib/server/env'
import { getPayloadClient } from '@/lib/server/payload-client'
import { mutateTeamMember } from '@/lib/server/team-console'
import { rateLimitTeamActor } from '@/lib/server/team-rate-limit'
import { isSameOriginMutation } from '@/lib/server/same-origin-mutation'
import { isActiveTeamUser } from '@/lib/server/team-service-shared'

type Context = { params: Promise<{ membershipId: string }> }

const headers = { 'cache-control': 'private, no-store' }
const response = (body: unknown, status: number, extra?: HeadersInit): NextResponse =>
  NextResponse.json(body, { headers: { ...headers, ...extra }, status })

export async function PATCH(request: Request, context: Context): Promise<NextResponse> {
  if (!isSameOriginMutation(request)) {
    return response(
      { error: { code: 'CROSS_SITE_REQUEST', message: 'This request origin is not allowed.' } },
      403,
    )
  }
  const payload = await getPayloadClient()
  const auth = await payload.auth({ headers: request.headers })
  if (!isActiveTeamUser(auth.user)) {
    return response(
      { error: { code: 'UNAUTHORIZED', message: 'Sign in to manage this team.' } },
      401,
    )
  }

  const body = await readBoundedJSON(request, MAX_TEAM_INVITATION_BODY_BYTES)
  const parsed = body.ok ? parseTeamMemberMutation(body.value) : null
  const membershipID = normalizeTeamIdentifier((await context.params).membershipId)
  if (!body.ok || !parsed?.ok || !membershipID) {
    return response(
      {
        error: {
          code: 'INVALID_INPUT',
          message: body.ok && parsed && !parsed.ok ? parsed.message : 'Select a valid team member.',
        },
      },
      body.ok ? 400 : body.status,
    )
  }

  const environment = getServerEnvironment()
  const limit = await rateLimitTeamActor({
    actorId: String(auth.user.id),
    eventHashSecret: environment.eventHashSecret,
    organizationId: parsed.value.organizationId,
  })
  if (!limit.allowed) {
    const retryAfter = Math.max(
      1,
      Math.ceil((new Date(limit.resetAt).getTime() - Date.now()) / 1_000),
    )
    return response(
      {
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many team changes. Try again later.',
        },
      },
      429,
      { 'retry-after': String(retryAfter) },
    )
  }

  const result = await mutateTeamMember({
    membershipID,
    mutation: parsed.value,
    payload,
    user: auth.user,
  })
  return result.ok
    ? response(result.value, 200)
    : response({ error: { code: result.code, message: result.message } }, result.status)
}
