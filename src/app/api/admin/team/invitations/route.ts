import { NextResponse } from 'next/server'

import {
  MAX_TEAM_INVITATION_BODY_BYTES,
  parseCreateTeamInvitation,
} from '@/lib/domain/team-invitations'
import { readBoundedJSON } from '@/lib/server/bounded-json'
import { getServerEnvironment } from '@/lib/server/env'
import { getPayloadClient } from '@/lib/server/payload-client'
import { rateLimitTeamActor, rateLimitTeamInvitationEmail } from '@/lib/server/team-rate-limit'
import {
  createWebhookTeamInvitationSender,
  getTeamInvitationDeliveryConfiguration,
} from '@/lib/server/team-invitation-delivery'
import {
  createOrganizationInvitation,
  TeamInvitationError,
} from '@/lib/server/team-invitation-service'
import { isSameOriginMutation } from '@/lib/server/same-origin-mutation'
import { isActiveTeamUser } from '@/lib/server/team-service-shared'
import { getApplicationSiteURL } from '@/lib/server/site-url'

const headers = { 'cache-control': 'private, no-store' }
const response = (body: unknown, status: number, extra?: HeadersInit): NextResponse =>
  NextResponse.json(body, { headers: { ...headers, ...extra }, status })

const limited = (resetAt: string): NextResponse => {
  const retryAfter = Math.max(1, Math.ceil((new Date(resetAt).getTime() - Date.now()) / 1_000))
  return response(
    {
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many invitation attempts. Try again later.',
      },
    },
    429,
    { 'retry-after': String(retryAfter) },
  )
}

export async function POST(request: Request): Promise<NextResponse> {
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
      { error: { code: 'UNAUTHORIZED', message: 'Sign in to invite a member.' } },
      401,
    )
  }

  const body = await readBoundedJSON(request, MAX_TEAM_INVITATION_BODY_BYTES)
  if (!body.ok) {
    return response({ error: { code: 'INVALID_INPUT', message: body.message } }, body.status)
  }
  const parsed = parseCreateTeamInvitation(body.value)
  if (!parsed.ok) {
    return response(
      {
        error: {
          code: 'INVALID_INPUT',
          field: parsed.field,
          message: parsed.message,
        },
      },
      400,
    )
  }

  const environment = getServerEnvironment()
  const [actorLimit, emailLimit] = await Promise.all([
    rateLimitTeamActor({
      actorId: String(auth.user.id),
      eventHashSecret: environment.eventHashSecret,
      organizationId: parsed.value.organizationId,
    }),
    rateLimitTeamInvitationEmail({
      email: parsed.value.email,
      eventHashSecret: environment.eventHashSecret,
      organizationId: parsed.value.organizationId,
    }),
  ])
  if (!actorLimit.allowed) return limited(actorLimit.resetAt)
  if (!emailLimit.allowed) return limited(emailLimit.resetAt)

  const delivery = getTeamInvitationDeliveryConfiguration()
  if (parsed.value.delivery === 'webhook' && delivery.status !== 'ready') {
    return response(
      {
        error: {
          code: 'DELIVERY_UNAVAILABLE',
          message: 'Invitation email delivery is unavailable.',
        },
      },
      503,
    )
  }

  try {
    const result = await createOrganizationInvitation(parsed.value, {
      appBaseURL:
        delivery.status === 'ready' ? delivery.appBaseURL : getApplicationSiteURL().origin,
      payload,
      ...(delivery.status === 'ready' && parsed.value.delivery === 'webhook'
        ? {
            sendInvitation: createWebhookTeamInvitationSender({
              secret: delivery.secret,
              url: delivery.webhookURL,
            }),
          }
        : {}),
      user: auth.user,
    })
    return response(result, 201)
  } catch (error) {
    if (error instanceof TeamInvitationError) {
      return response({ error: { code: error.code, message: error.message } }, error.status)
    }
    return response(
      {
        error: {
          code: 'INVITATION_UNAVAILABLE',
          message: 'LinksetGo could not create this invitation.',
        },
      },
      503,
    )
  }
}
