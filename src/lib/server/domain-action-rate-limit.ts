import 'server-only'

import {
  InMemoryRateLimitProvider,
  type RateLimitDecision,
  type RateLimitProvider,
} from '@/lib/application/rate-limit-provider'
import { privacySafeHash } from './request-privacy'

const localProvider = new InMemoryRateLimitProvider()

export function rateLimitDomainAction(input: {
  actorID: string
  domainID: string
  eventHashSecret: string
  provider?: RateLimitProvider
}): Promise<RateLimitDecision> {
  return (input.provider ?? localProvider).consume({
    bucket: 'custom-domain-action',
    key: privacySafeHash(`${input.actorID}:${input.domainID}`, input.eventHashSecret),
    limit: 30,
    windowMs: 60 * 60 * 1_000,
  })
}
