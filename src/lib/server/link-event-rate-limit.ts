import 'server-only'

import {
  InMemoryRateLimitProvider,
  type RateLimitProvider,
} from '@/lib/application/rate-limit-provider'
import {
  EVENT_CLIENT_RATE_LIMIT,
  EVENT_DEDUPE_WINDOW_MS,
  EVENT_LINK_TYPE_RATE_LIMIT,
  EVENT_RATE_WINDOW_MS,
} from '@/lib/domain/event-policy'
import type { LinkEvent } from '@/payload-types'
import { getServerEnvironment } from './env'
import { PostgresRateLimitProvider } from './postgres-rate-limit-provider'
import { privacySafeHash, privacySafeRequestKey } from './request-privacy'

type PublicEventType = LinkEvent['eventType']
type InteractionEventType = Exclude<PublicEventType, 'resolved'>

// Local development uses Payload schema push, which intentionally does not run
// raw production migrations. Keep browser QA usable there; every production
// replica must coordinate through PostgreSQL and fails closed if it is missing.
const distributedProvider: RateLimitProvider =
  process.env.NODE_ENV === 'production'
    ? new PostgresRateLimitProvider()
    : new InMemoryRateLimitProvider()
const anonymousIngressIdentity = 'link-event-untrusted-ingress'

export const RESOLVER_CLIENT_RATE_LIMIT = 30
export const RESOLVER_CLIENT_LINK_RATE_LIMIT = 10
export const RESOLVER_LINK_RATE_LIMIT = 600

export const EVENT_TOKEN_MULTIPLICITY = {
  'app-opened': 1,
  'fallback-viewed': 1,
  'open-app-clicked': 2,
  'store-clicked': 2,
} as const satisfies Readonly<Record<InteractionEventType, number>>

export type LinkEventAdmissionGrant = Readonly<{
  clientKey: string
  eventType: PublicEventType
  resourceKey: string
}>

type AdmissionResult =
  | { allowed: true; grant: LinkEventAdmissionGrant }
  | {
      allowed: false
      reason: 'client-rate' | 'duplicate' | 'token-rate'
    }

type ResolverAdmissionResult =
  | { allowed: true }
  | {
      allowed: false
      reason: 'client-rate' | 'link-rate'
    }

export function publicLinkEventClientKey(request: Request): string {
  const environment = getServerEnvironment()
  if (!environment.trustProxyClientIPHeader) {
    return privacySafeHash(anonymousIngressIdentity, environment.eventHashSecret)
  }
  return privacySafeRequestKey({
    request,
    secret: environment.eventHashSecret,
    trustProxyClientIPHeader: true,
  })
}

async function consume(
  provider: RateLimitProvider,
  input: {
    bucket: string
    key: string
    limit: number
    windowMs: number
  },
): Promise<boolean> {
  return (await provider.consume(input)).allowed
}

export async function admitPublicLinkResolution(input: {
  appSlug: string
  clientRateLimit?: boolean
  clientKey: string
  eventHashSecret: string
  hostname: string
  linkSlug: string
  provider?: RateLimitProvider
}): Promise<ResolverAdmissionResult> {
  const provider = input.provider ?? distributedProvider
  const targetKey = privacySafeHash(
    `${input.hostname}:${input.appSlug}:${input.linkSlug}`,
    input.eventHashSecret,
  )
  if (
    input.clientRateLimit !== false &&
    !(
      await provider.consumePair(
        {
          bucket: 'resolver-client',
          key: input.clientKey,
          limit: RESOLVER_CLIENT_RATE_LIMIT,
          windowMs: EVENT_RATE_WINDOW_MS,
        },
        {
          bucket: 'resolver-client-link',
          key: privacySafeHash(`${input.clientKey}:${targetKey}`, input.eventHashSecret),
          limit: RESOLVER_CLIENT_LINK_RATE_LIMIT,
          windowMs: EVENT_RATE_WINDOW_MS,
        },
      )
    ).allowed
  ) {
    return { allowed: false, reason: 'client-rate' }
  }

  if (
    !(await consume(provider, {
      bucket: 'resolver-link',
      key: targetKey,
      limit: RESOLVER_LINK_RATE_LIMIT,
      windowMs: EVENT_RATE_WINDOW_MS,
    }))
  ) {
    return { allowed: false, reason: 'link-rate' }
  }
  return { allowed: true }
}

export async function admitResolvedLinkEvent(input: {
  clientKey: string
  eventHashSecret: string
  provider?: RateLimitProvider
  resourceKey: string
}): Promise<AdmissionResult> {
  const provider = input.provider ?? distributedProvider
  const duplicateKey = privacySafeHash(
    `${input.clientKey}:${input.resourceKey}:resolved`,
    input.eventHashSecret,
  )
  if (
    !(await consume(provider, {
      bucket: 'link-event-dedupe',
      key: duplicateKey,
      limit: 1,
      windowMs: EVENT_DEDUPE_WINDOW_MS,
    }))
  ) {
    return { allowed: false, reason: 'duplicate' }
  }
  return {
    allowed: true,
    grant: Object.freeze({
      clientKey: input.clientKey,
      eventType: 'resolved',
      resourceKey: input.resourceKey,
    }),
  }
}

export async function admitInteractionLinkEvent(input: {
  clientRateLimit?: boolean
  clientKey: string
  eventHashSecret: string
  eventType: InteractionEventType
  provider?: RateLimitProvider
  resourceKey: string
  tokenNonce: string
  tokenWindowMs: number
}): Promise<AdmissionResult> {
  const provider = input.provider ?? distributedProvider
  if (
    !(await consume(provider, {
      bucket: 'link-event-token',
      key: privacySafeHash(`${input.tokenNonce}:${input.eventType}`, input.eventHashSecret),
      limit: EVENT_TOKEN_MULTIPLICITY[input.eventType],
      windowMs: input.tokenWindowMs,
    }))
  ) {
    return { allowed: false, reason: 'token-rate' }
  }

  const targetLimit = {
    bucket: 'link-event-target',
    key: privacySafeHash(`${input.resourceKey}:${input.eventType}`, input.eventHashSecret),
    limit: EVENT_LINK_TYPE_RATE_LIMIT,
    windowMs: EVENT_RATE_WINDOW_MS,
  }
  const eventRateAllowed =
    input.clientRateLimit === false
      ? await consume(provider, targetLimit)
      : (
          await provider.consumePair(
            {
              bucket: 'link-event-client',
              key: input.clientKey,
              limit: EVENT_CLIENT_RATE_LIMIT,
              windowMs: EVENT_RATE_WINDOW_MS,
            },
            targetLimit,
          )
        ).allowed
  if (!eventRateAllowed) {
    return { allowed: false, reason: 'client-rate' }
  }

  return {
    allowed: true,
    grant: Object.freeze({
      clientKey: input.clientKey,
      eventType: input.eventType,
      resourceKey: input.resourceKey,
    }),
  }
}
