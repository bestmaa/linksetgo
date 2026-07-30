import 'server-only'

import {
  type RateLimitDecision,
  type RateLimitProvider,
} from '@/lib/application/rate-limit-provider'
import { PostgresRateLimitProvider } from './postgres-rate-limit-provider'
import { privacySafeHash } from './request-privacy'

const distributedProvider = new PostgresRateLimitProvider()

export const QUICK_LINK_CREATION_LIMIT = 30
export const QUICK_LINK_CREATION_WINDOW_MS = 60 * 60 * 1_000

export function rateLimitQuickLinkCreation(input: {
  actorID: string
  eventHashSecret: string
  provider?: RateLimitProvider
  workspaceID: string
}): Promise<RateLimitDecision> {
  return (input.provider ?? distributedProvider).consumePair(
    {
      bucket: 'quick-link-creation-actor',
      key: privacySafeHash(input.actorID, input.eventHashSecret),
      limit: QUICK_LINK_CREATION_LIMIT,
      windowMs: QUICK_LINK_CREATION_WINDOW_MS,
    },
    {
      bucket: 'quick-link-creation-workspace',
      key: privacySafeHash(`${input.actorID}:${input.workspaceID}`, input.eventHashSecret),
      limit: QUICK_LINK_CREATION_LIMIT,
      windowMs: QUICK_LINK_CREATION_WINDOW_MS,
    },
  )
}
