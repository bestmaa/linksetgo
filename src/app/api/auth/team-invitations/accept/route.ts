import { NextResponse } from 'next/server'

import {
  MAX_TEAM_INVITATION_BODY_BYTES,
  parseAcceptTeamInvitation,
} from '@/lib/domain/team-invitations'
import { readBoundedJSON } from '@/lib/server/bounded-json'
import { getServerEnvironment } from '@/lib/server/env'
import { getPayloadClient } from '@/lib/server/payload-client'
import { rateLimitTeamPublicRequest, rateLimitTeamToken } from '@/lib/server/team-rate-limit'
import {
  acceptOrganizationInvitation,
  TeamInvitationError,
} from '@/lib/server/team-invitation-service'
import { isActiveTeamUser } from '@/lib/server/team-service-shared'

const headers = { 'cache-control': 'no-store' }
const response = (body: unknown, status: number): NextResponse =>
  NextResponse.json(body, { headers, status })

export async function POST(request: Request): Promise<NextResponse> {
  const environment = getServerEnvironment()
  const requestLimit = await rateLimitTeamPublicRequest({
    eventHashSecret: environment.eventHashSecret,
    request,
    trustProxy: environment.trustProxyClientIPHeader,
  })
  if (!requestLimit.allowed) {
    return response(
      {
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many invitation attempts. Try again later.',
        },
      },
      429,
    )
  }

  const body = await readBoundedJSON(request, MAX_TEAM_INVITATION_BODY_BYTES)
  if (!body.ok) {
    return response(
      {
        error: {
          code: 'INVITATION_INVALID',
          message: 'This invitation request is invalid.',
        },
      },
      body.status,
    )
  }
  const parsed = parseAcceptTeamInvitation(body.value)
  if (!parsed.ok) {
    return response(
      {
        error: {
          code: 'INVITATION_INVALID',
          field: parsed.field,
          message: parsed.message,
        },
      },
      400,
    )
  }

  const tokenLimit = await rateLimitTeamToken({
    eventHashSecret: environment.eventHashSecret,
    token: parsed.value.token,
  })
  if (!tokenLimit.allowed) {
    return response(
      {
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many invitation attempts. Try again later.',
        },
      },
      429,
    )
  }

  try {
    const payload = await getPayloadClient()
    const auth = await payload.auth({ headers: request.headers })
    const result = await acceptOrganizationInvitation(parsed.value, {
      authenticatedUser: isActiveTeamUser(auth.user) ? auth.user : null,
      payload,
    })
    return response(result, 200)
  } catch (error) {
    if (error instanceof TeamInvitationError) {
      const message =
        error.code === 'INVITATION_INVALID'
          ? 'This invitation link is invalid or no longer available.'
          : error.message
      return response({ error: { code: error.code, message } }, error.status)
    }
    return response(
      {
        error: {
          code: 'INVITATION_INVALID',
          message: 'This invitation could not be accepted.',
        },
      },
      503,
    )
  }
}
