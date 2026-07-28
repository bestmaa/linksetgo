import 'server-only'

import {
  InMemoryRateLimitProvider,
  type RateLimitDecision,
  type RateLimitProvider,
} from '@/lib/application/rate-limit-provider'

import { privacySafeHash } from './request-privacy'

const localProvider = new InMemoryRateLimitProvider()

export function rateLimitFallbackOriginRegistration(input: {
  actorID: string
  eventHashSecret: string
  provider?: RateLimitProvider
  workspaceID: string
}): Promise<RateLimitDecision> {
  return (input.provider ?? localProvider).consume({
    bucket: 'fallback-origin-registration',
    key: privacySafeHash(`${input.actorID}:${input.workspaceID}`, input.eventHashSecret),
    limit: 10,
    windowMs: 24 * 60 * 60 * 1_000,
  })
}

export function rateLimitFallbackOriginAction(input: {
  actorID: string
  eventHashSecret: string
  originID: string
  provider?: RateLimitProvider
}): Promise<RateLimitDecision> {
  return (input.provider ?? localProvider).consume({
    bucket: 'fallback-origin-action',
    key: privacySafeHash(`${input.actorID}:${input.originID}`, input.eventHashSecret),
    limit: 30,
    windowMs: 60 * 60 * 1_000,
  })
}
