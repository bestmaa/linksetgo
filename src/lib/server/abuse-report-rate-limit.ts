import 'server-only'

import {
  InMemoryRateLimitProvider,
  type RateLimitDecision,
  type RateLimitProvider,
} from '@/lib/application/rate-limit-provider'
import { privacySafeHash, privacySafeRequestKey } from './request-privacy'

const localProvider = new InMemoryRateLimitProvider()

export function rateLimitAbuseReportRequest(input: {
  eventHashSecret: string
  provider?: RateLimitProvider
  request: Request
  trustProxyClientIPHeader: boolean
}): Promise<RateLimitDecision> {
  // This per-process control is defense in depth. Multi-instance Cloud ingress
  // must enforce a provider-backed distributed limit for this route as well.
  return (input.provider ?? localProvider).consume({
    bucket: 'public-abuse-report-request',
    key: privacySafeRequestKey({
      request: input.request,
      secret: input.eventHashSecret,
      trustProxyClientIPHeader: input.trustProxyClientIPHeader,
    }),
    limit: 5,
    windowMs: 60 * 60 * 1_000,
  })
}

export function rateLimitAbuseReportTarget(input: {
  eventHashSecret: string
  hostname: string
  provider?: RateLimitProvider
}): Promise<RateLimitDecision> {
  return (input.provider ?? localProvider).consume({
    bucket: 'public-abuse-report-target',
    key: privacySafeHash(input.hostname, input.eventHashSecret),
    limit: 25,
    windowMs: 24 * 60 * 60 * 1_000,
  })
}
