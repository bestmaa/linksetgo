import 'server-only'

import {
  type RateLimitDecision,
  type RateLimitProvider,
} from '@/lib/application/rate-limit-provider'
import { PostgresRateLimitProvider } from './postgres-rate-limit-provider'
import { privacySafeHash, privacySafeRequestKey } from './request-privacy'

const distributedProvider = new PostgresRateLimitProvider()
const hourMs = 60 * 60 * 1_000
const dayMs = 24 * hourMs

export type CloudEmailDeliveryFlow = 'password-recovery' | 'signup' | 'verification-resend'

async function consumeWithGlobalCeiling(
  provider: RateLimitProvider,
  input: {
    eventHashSecret: string
    globalBucket: string
    globalLimit: number
    scopedBucket: string
    scopedKey: string
    scopedLimit: number
    windowMs: number
  },
): Promise<RateLimitDecision> {
  return provider.consumePair(
    {
      bucket: input.globalBucket,
      key: privacySafeHash('global', input.eventHashSecret),
      limit: input.globalLimit,
      windowMs: input.windowMs,
    },
    {
      bucket: input.scopedBucket,
      key: input.scopedKey,
      limit: input.scopedLimit,
      windowMs: input.windowMs,
    },
  )
}

export async function rateLimitCloudSignupRequest(input: {
  eventHashSecret: string
  provider?: RateLimitProvider
  request: Request
  trustProxy: boolean
}): Promise<RateLimitDecision> {
  const provider = input.provider ?? distributedProvider
  return consumeWithGlobalCeiling(provider, {
    eventHashSecret: input.eventHashSecret,
    globalBucket: 'cloud-signup-global',
    globalLimit: 10_000,
    scopedBucket: 'cloud-signup-request',
    scopedKey: privacySafeRequestKey({
      request: input.request,
      secret: input.eventHashSecret,
      trustProxyClientIPHeader: input.trustProxy,
    }),
    scopedLimit: 10,
    windowMs: hourMs,
  })
}

export async function rateLimitCloudSignupEmail(input: {
  email: string
  eventHashSecret: string
  provider?: RateLimitProvider
}): Promise<RateLimitDecision> {
  return (input.provider ?? distributedProvider).consume({
    bucket: 'cloud-signup-email',
    key: privacySafeHash(input.email, input.eventHashSecret),
    limit: 4,
    windowMs: dayMs,
  })
}

export function rateLimitCloudEmailDelivery(input: {
  email: string
  eventHashSecret: string
  flow: CloudEmailDeliveryFlow
  provider?: RateLimitProvider
}): Promise<RateLimitDecision> {
  const globalLimits: Record<CloudEmailDeliveryFlow, number> = {
    'password-recovery': 5_000,
    signup: 10_000,
    'verification-resend': 5_000,
  }
  const emailLimits: Record<CloudEmailDeliveryFlow, number> = {
    'password-recovery': 4,
    signup: 4,
    'verification-resend': 3,
  }
  return (input.provider ?? distributedProvider).consumePair(
    {
      bucket: `cloud-${input.flow}-delivery-global`,
      key: privacySafeHash('global', input.eventHashSecret),
      limit: globalLimits[input.flow],
      windowMs: dayMs,
    },
    {
      bucket: `cloud-${input.flow}-delivery-email`,
      key: privacySafeHash(input.email, input.eventHashSecret),
      limit: emailLimits[input.flow],
      windowMs: dayMs,
    },
  )
}

export async function rateLimitCloudVerificationRequest(input: {
  eventHashSecret: string
  provider?: RateLimitProvider
  request: Request
  trustProxy: boolean
}): Promise<RateLimitDecision> {
  return consumeWithGlobalCeiling(input.provider ?? distributedProvider, {
    eventHashSecret: input.eventHashSecret,
    globalBucket: 'cloud-email-verification-global',
    globalLimit: 20_000,
    scopedBucket: 'cloud-email-verification',
    scopedKey: privacySafeRequestKey({
      request: input.request,
      secret: input.eventHashSecret,
      trustProxyClientIPHeader: input.trustProxy,
    }),
    scopedLimit: 20,
    windowMs: hourMs,
  })
}

export function rateLimitCloudVerificationResendRequest(input: {
  eventHashSecret: string
  provider?: RateLimitProvider
  request: Request
  trustProxy: boolean
}): Promise<RateLimitDecision> {
  return consumeWithGlobalCeiling(input.provider ?? distributedProvider, {
    eventHashSecret: input.eventHashSecret,
    globalBucket: 'cloud-verification-resend-global',
    globalLimit: 10_000,
    scopedBucket: 'cloud-verification-resend-request',
    scopedKey: privacySafeRequestKey({
      request: input.request,
      secret: input.eventHashSecret,
      trustProxyClientIPHeader: input.trustProxy,
    }),
    scopedLimit: 10,
    windowMs: hourMs,
  })
}

export function rateLimitCloudVerificationResendEmail(input: {
  email: string
  eventHashSecret: string
  provider?: RateLimitProvider
}): Promise<RateLimitDecision> {
  return (input.provider ?? distributedProvider).consume({
    bucket: 'cloud-verification-resend-email',
    key: privacySafeHash(input.email, input.eventHashSecret),
    limit: 3,
    windowMs: dayMs,
  })
}

export function rateLimitPasswordRecoveryRequest(input: {
  eventHashSecret: string
  provider?: RateLimitProvider
  request: Request
  trustProxy: boolean
}): Promise<RateLimitDecision> {
  return consumeWithGlobalCeiling(input.provider ?? distributedProvider, {
    eventHashSecret: input.eventHashSecret,
    globalBucket: 'cloud-password-recovery-global',
    globalLimit: 10_000,
    scopedBucket: 'cloud-password-recovery-request',
    scopedKey: privacySafeRequestKey({
      request: input.request,
      secret: input.eventHashSecret,
      trustProxyClientIPHeader: input.trustProxy,
    }),
    scopedLimit: 10,
    windowMs: hourMs,
  })
}

export function rateLimitPasswordRecoveryEmail(input: {
  email: string
  eventHashSecret: string
  provider?: RateLimitProvider
}): Promise<RateLimitDecision> {
  return (input.provider ?? distributedProvider).consume({
    bucket: 'cloud-password-recovery-email',
    key: privacySafeHash(input.email, input.eventHashSecret),
    limit: 4,
    windowMs: dayMs,
  })
}

export function rateLimitPasswordResetRequest(input: {
  eventHashSecret: string
  provider?: RateLimitProvider
  request: Request
  trustProxy: boolean
}): Promise<RateLimitDecision> {
  return consumeWithGlobalCeiling(input.provider ?? distributedProvider, {
    eventHashSecret: input.eventHashSecret,
    globalBucket: 'cloud-password-reset-global',
    globalLimit: 20_000,
    scopedBucket: 'cloud-password-reset-request',
    scopedKey: privacySafeRequestKey({
      request: input.request,
      secret: input.eventHashSecret,
      trustProxyClientIPHeader: input.trustProxy,
    }),
    scopedLimit: 20,
    windowMs: hourMs,
  })
}
