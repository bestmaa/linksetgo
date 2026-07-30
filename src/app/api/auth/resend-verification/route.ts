import { after, NextResponse } from 'next/server'
import type { Payload } from 'payload'

import {
  MAX_ACCOUNT_RECOVERY_BODY_BYTES,
  parseAccountEmailRequest,
} from '@/lib/domain/account-recovery'
import { waitForNonEnumeratingAccountResponse } from '@/lib/server/account-response-timing'
import { readBoundedJSON } from '@/lib/server/bounded-json'
import { runCloudAccountEmailOutboxSafely } from '@/lib/server/cloud-account-email-sweep'
import { queueCloudAccountEmailDelivery } from '@/lib/server/cloud-account-email-outbox'
import { getCloudSignupConfiguration } from '@/lib/server/cloud-signup-config'
import { resendCloudSignupVerification } from '@/lib/server/cloud-signup-service'
import {
  rateLimitCloudEmailDelivery,
  rateLimitCloudVerificationResendRequest,
} from '@/lib/server/cloud-signup-rate-limit'
import { getServerEnvironment } from '@/lib/server/env'
import { getPayloadClient } from '@/lib/server/payload-client'

const json = (body: unknown, status: number, headers?: HeadersInit): NextResponse =>
  NextResponse.json(body, {
    status,
    headers: { 'cache-control': 'no-store', ...headers },
  })

const accepted = (): NextResponse =>
  json(
    {
      status: 'accepted',
      message: 'If a pending account matches that email, a new verification link is on its way.',
    },
    202,
  )

const limited = (resetAt: string): NextResponse => {
  const seconds = Math.max(1, Math.ceil((Date.parse(resetAt) - Date.now()) / 1_000))
  return json(
    { status: 'error', error: { code: 'RATE_LIMITED', message: 'Try again later.' } },
    429,
    { 'retry-after': String(seconds) },
  )
}

export async function POST(request: Request): Promise<NextResponse> {
  const configuration = getCloudSignupConfiguration()
  if (configuration.status !== 'ready') {
    return json(
      {
        status: 'unavailable',
        error: { code: 'VERIFICATION_UNAVAILABLE', message: 'Verification is unavailable.' },
      },
      configuration.status === 'misconfigured' ? 503 : 404,
    )
  }

  const body = await readBoundedJSON(request, MAX_ACCOUNT_RECOVERY_BODY_BYTES)
  if (!body.ok) return json({ status: 'error', error: { code: 'INVALID_REQUEST' } }, body.status)
  const parsed = parseAccountEmailRequest(body.value)
  if (!parsed.ok) {
    return json(
      { status: 'error', error: { code: 'INVALID_REQUEST', message: parsed.message } },
      400,
    )
  }

  const environment = getServerEnvironment()
  const requestLimit = await rateLimitCloudVerificationResendRequest({
    eventHashSecret: environment.eventHashSecret,
    request,
    trustProxy: environment.trustProxyClientIPHeader,
  })
  if (!requestLimit.allowed) return limited(requestLimit.resetAt)

  const responseStartedAt = performance.now()
  let payload: Payload | null = null
  try {
    payload = await getPayloadClient()
    await resendCloudSignupVerification(parsed.email, {
      appBaseURL: configuration.appBaseURL,
      authorizeDelivery: async (email) => {
        const deliveryLimit = await rateLimitCloudEmailDelivery({
          email,
          eventHashSecret: environment.eventHashSecret,
          flow: 'verification-resend',
        })
        return deliveryLimit.allowed
      },
      payload,
      queueVerification: (delivery, req) =>
        queueCloudAccountEmailDelivery({
          delivery: { delivery, kind: 'verification' },
          encryptionSecret: environment.eventHashSecret,
          payload: req.payload,
          req,
        }),
    })
  } catch {
    // Keep delivery and account existence non-enumerating.
  }
  if (payload) {
    const queuedPayload = payload
    after(() => runCloudAccountEmailOutboxSafely(queuedPayload))
  }
  await waitForNonEnumeratingAccountResponse(responseStartedAt)
  return accepted()
}
