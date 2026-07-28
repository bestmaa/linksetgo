import { NextResponse } from 'next/server'

import {
  MAX_TEAM_INVITATION_BODY_BYTES,
  normalizeTeamIdentifier,
} from '@/lib/domain/team-invitations'
import { readBoundedJSON } from '@/lib/server/bounded-json'
import { getServerEnvironment } from '@/lib/server/env'
import { getPayloadClient } from '@/lib/server/payload-client'
import { rateLimitTeamActor } from '@/lib/server/team-rate-limit'
import {
  revokeOrganizationInvitation,
  TeamInvitationError,
} from '@/lib/server/team-invitation-service'
import { isSameOriginMutation } from '@/lib/server/same-origin-mutation'
import { isActiveTeamUser } from '@/lib/server/team-service-shared'

type Context = { params: Promise<{ invitationId: string }> }

const headers = { 'cache-control': 'private, no-store' }
const response = (body: unknown, status: number, extra?: HeadersInit): NextResponse =>
  NextResponse.json(body, { headers: { ...headers, ...extra }, status })

const parseOrganization = (value: unknown): string | null => {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== 1 ||
    !Object.hasOwn(value, 'organizationId')
  ) {
    return null
  }
  return normalizeTeamIdentifier((value as Record<string, unknown>).organizationId)
}

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
      { error: { code: 'UNAUTHORIZED', message: 'Sign in to revoke an invitation.' } },
      401,
    )
  }

  const body = await readBoundedJSON(request, MAX_TEAM_INVITATION_BODY_BYTES)
  const organizationID = body.ok ? parseOrganization(body.value) : null
  const invitationID = normalizeTeamIdentifier((await context.params).invitationId)
  if (!body.ok || !organizationID || !invitationID) {
    return response(
      { error: { code: 'INVALID_INPUT', message: 'Select a valid invitation.' } },
      body.ok ? 400 : body.status,
    )
  }

  const environment = getServerEnvironment()
  const limit = await rateLimitTeamActor({
    actorId: String(auth.user.id),
    eventHashSecret: environment.eventHashSecret,
    organizationId: organizationID,
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

  try {
    await revokeOrganizationInvitation({
      invitationID,
      organizationID,
      payload,
      user: auth.user,
    })
    return response({ status: 'revoked' }, 200)
  } catch (error) {
    return error instanceof TeamInvitationError
      ? response({ error: { code: error.code, message: error.message } }, error.status)
      : response(
          {
            error: {
              code: 'INVITATION_UNAVAILABLE',
              message: 'Relay could not revoke this invitation.',
            },
          },
          503,
        )
  }
}
