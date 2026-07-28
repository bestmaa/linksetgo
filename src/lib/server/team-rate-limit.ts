import 'server-only'

import {
  InMemoryRateLimitProvider,
  type RateLimitDecision,
  type RateLimitProvider,
} from '@/lib/application/rate-limit-provider'
import { privacySafeHash, privacySafeRequestKey } from './request-privacy'

const localProvider = new InMemoryRateLimitProvider()

export async function rateLimitTeamActor(input: {
  actorId: string
  eventHashSecret: string
  organizationId: string
  provider?: RateLimitProvider
}): Promise<RateLimitDecision> {
  return (input.provider ?? localProvider).consume({
    bucket: 'team-management-actor',
    key: privacySafeHash(`${input.actorId}:${input.organizationId}`, input.eventHashSecret),
    limit: 60,
    windowMs: 60 * 60 * 1000,
  })
}

export async function rateLimitTeamInvitationEmail(input: {
  email: string
  eventHashSecret: string
  organizationId: string
  provider?: RateLimitProvider
}): Promise<RateLimitDecision> {
  return (input.provider ?? localProvider).consume({
    bucket: 'team-invitation-email',
    key: privacySafeHash(`${input.organizationId}:${input.email}`, input.eventHashSecret),
    limit: 5,
    windowMs: 24 * 60 * 60 * 1000,
  })
}

export async function rateLimitTeamPublicRequest(input: {
  eventHashSecret: string
  provider?: RateLimitProvider
  request: Request
  trustProxy: boolean
}): Promise<RateLimitDecision> {
  return (input.provider ?? localProvider).consume({
    bucket: 'team-invitation-public',
    key: privacySafeRequestKey({
      request: input.request,
      secret: input.eventHashSecret,
      trustProxyClientIPHeader: input.trustProxy,
    }),
    limit: 30,
    windowMs: 60 * 60 * 1000,
  })
}

export async function rateLimitTeamToken(input: {
  eventHashSecret: string
  provider?: RateLimitProvider
  token: string
}): Promise<RateLimitDecision> {
  return (input.provider ?? localProvider).consume({
    bucket: 'team-invitation-token',
    key: privacySafeHash(input.token, input.eventHashSecret),
    limit: 12,
    windowMs: 60 * 60 * 1000,
  })
}
