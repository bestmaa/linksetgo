import { NextResponse } from 'next/server'

import {
  MAX_TEAM_INVITATION_BODY_BYTES,
  parseTeamInvitationToken,
} from '@/lib/domain/team-invitations'
import { readBoundedJSON } from '@/lib/server/bounded-json'
import { getServerEnvironment } from '@/lib/server/env'
import { getPayloadClient } from '@/lib/server/payload-client'
import { rateLimitTeamPublicRequest, rateLimitTeamToken } from '@/lib/server/team-rate-limit'
import {
  previewOrganizationInvitation,
  TeamInvitationError,
} from '@/lib/server/team-invitation-service'
import { isActiveTeamUser } from '@/lib/server/team-service-shared'

const headers = { 'cache-control': 'no-store' }
const response = (body: unknown, status: number, extra?: HeadersInit): NextResponse =>
  NextResponse.json(body, { headers: { ...headers, ...extra }, status })

const invalid = (status = 400): NextResponse =>
  response(
    {
      error: {
        code: 'INVITATION_INVALID',
        message: 'This invitation link is invalid or no longer available.',
      },
    },
    status,
  )

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
  if (!body.ok) return invalid(body.status)
  const parsed = parseTeamInvitationToken(body.value)
  if (!parsed.ok) return invalid()

  const tokenLimit = await rateLimitTeamToken({
    eventHashSecret: environment.eventHashSecret,
    token: parsed.value,
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
    const result = await previewOrganizationInvitation({
      authenticatedUser: isActiveTeamUser(auth.user) ? auth.user : null,
      payload,
      token: parsed.value,
    })
    return response(result, 200)
  } catch (error) {
    return error instanceof TeamInvitationError ? invalid(error.status) : invalid(503)
  }
}
