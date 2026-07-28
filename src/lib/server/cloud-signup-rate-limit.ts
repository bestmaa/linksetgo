import 'server-only'

import {
  InMemoryRateLimitProvider,
  type RateLimitDecision,
  type RateLimitProvider,
} from '@/lib/application/rate-limit-provider'
import { privacySafeHash, privacySafeRequestKey } from './request-privacy'

const localProvider = new InMemoryRateLimitProvider()

export async function rateLimitCloudSignupRequest(input: {
  eventHashSecret: string
  provider?: RateLimitProvider
  request: Request
  trustProxy: boolean
}): Promise<RateLimitDecision> {
  const provider = input.provider ?? localProvider

  // This protects one Relay process. Cloud ingress must also enforce a distributed
  // edge limit because a memory provider cannot coordinate horizontally.
  return provider.consume({
    bucket: 'cloud-signup-request',
    key: privacySafeRequestKey({
      request: input.request,
      secret: input.eventHashSecret,
      trustProxyClientIPHeader: input.trustProxy,
    }),
    limit: 10,
    windowMs: 60 * 60 * 1000,
  })
}

export async function rateLimitCloudSignupEmail(input: {
  email: string
  eventHashSecret: string
  provider?: RateLimitProvider
}): Promise<RateLimitDecision> {
  return (input.provider ?? localProvider).consume({
    bucket: 'cloud-signup-email',
    key: privacySafeHash(input.email, input.eventHashSecret),
    limit: 4,
    windowMs: 24 * 60 * 60 * 1000,
  })
}

export async function rateLimitCloudVerificationRequest(input: {
  eventHashSecret: string
  provider?: RateLimitProvider
  request: Request
  trustProxy: boolean
}): Promise<RateLimitDecision> {
  return (input.provider ?? localProvider).consume({
    bucket: 'cloud-email-verification',
    key: privacySafeRequestKey({
      request: input.request,
      secret: input.eventHashSecret,
      trustProxyClientIPHeader: input.trustProxy,
    }),
    limit: 20,
    windowMs: 60 * 60 * 1000,
  })
}

export function rateLimitCloudVerificationResendRequest(input: {
  eventHashSecret: string
  provider?: RateLimitProvider
  request: Request
  trustProxy: boolean
}): Promise<RateLimitDecision> {
  return (input.provider ?? localProvider).consume({
    bucket: 'cloud-verification-resend-request',
    key: privacySafeRequestKey({
      request: input.request,
      secret: input.eventHashSecret,
      trustProxyClientIPHeader: input.trustProxy,
    }),
    limit: 10,
    windowMs: 60 * 60 * 1_000,
  })
}

export function rateLimitCloudVerificationResendEmail(input: {
  email: string
  eventHashSecret: string
  provider?: RateLimitProvider
}): Promise<RateLimitDecision> {
  return (input.provider ?? localProvider).consume({
    bucket: 'cloud-verification-resend-email',
    key: privacySafeHash(input.email, input.eventHashSecret),
    limit: 3,
    windowMs: 24 * 60 * 60 * 1_000,
  })
}

export function rateLimitPasswordRecoveryRequest(input: {
  eventHashSecret: string
  provider?: RateLimitProvider
  request: Request
  trustProxy: boolean
}): Promise<RateLimitDecision> {
  return (input.provider ?? localProvider).consume({
    bucket: 'cloud-password-recovery-request',
    key: privacySafeRequestKey({
      request: input.request,
      secret: input.eventHashSecret,
      trustProxyClientIPHeader: input.trustProxy,
    }),
    limit: 10,
    windowMs: 60 * 60 * 1_000,
  })
}

export function rateLimitPasswordRecoveryEmail(input: {
  email: string
  eventHashSecret: string
  provider?: RateLimitProvider
}): Promise<RateLimitDecision> {
  return (input.provider ?? localProvider).consume({
    bucket: 'cloud-password-recovery-email',
    key: privacySafeHash(input.email, input.eventHashSecret),
    limit: 4,
    windowMs: 24 * 60 * 60 * 1_000,
  })
}

export function rateLimitPasswordResetRequest(input: {
  eventHashSecret: string
  provider?: RateLimitProvider
  request: Request
  trustProxy: boolean
}): Promise<RateLimitDecision> {
  return (input.provider ?? localProvider).consume({
    bucket: 'cloud-password-reset-request',
    key: privacySafeRequestKey({
      request: input.request,
      secret: input.eventHashSecret,
      trustProxyClientIPHeader: input.trustProxy,
    }),
    limit: 20,
    windowMs: 60 * 60 * 1_000,
  })
}
