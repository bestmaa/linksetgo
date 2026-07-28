import { NextResponse } from 'next/server'

import {
  MAX_ACCOUNT_RECOVERY_BODY_BYTES,
  parseAccountEmailRequest,
} from '@/lib/domain/account-recovery'
import { readBoundedJSON } from '@/lib/server/bounded-json'
import { getCloudSignupConfiguration } from '@/lib/server/cloud-signup-config'
import { resendCloudSignupVerification } from '@/lib/server/cloud-signup-service'
import {
  rateLimitCloudVerificationResendEmail,
  rateLimitCloudVerificationResendRequest,
} from '@/lib/server/cloud-signup-rate-limit'
import { createWebhookVerificationSender } from '@/lib/server/cloud-verification-webhook'
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

  const environment = getServerEnvironment()
  const requestLimit = await rateLimitCloudVerificationResendRequest({
    eventHashSecret: environment.eventHashSecret,
    request,
    trustProxy: environment.trustProxyClientIPHeader,
  })
  if (!requestLimit.allowed) return limited(requestLimit.resetAt)

  const body = await readBoundedJSON(request, MAX_ACCOUNT_RECOVERY_BODY_BYTES)
  if (!body.ok) return json({ status: 'error', error: { code: 'INVALID_REQUEST' } }, body.status)
  const parsed = parseAccountEmailRequest(body.value)
  if (!parsed.ok) {
    return json(
      { status: 'error', error: { code: 'INVALID_REQUEST', message: parsed.message } },
      400,
    )
  }

  const emailLimit = await rateLimitCloudVerificationResendEmail({
    email: parsed.email,
    eventHashSecret: environment.eventHashSecret,
  })
  if (!emailLimit.allowed) return limited(emailLimit.resetAt)

  try {
    await resendCloudSignupVerification(parsed.email, {
      appBaseURL: configuration.appBaseURL,
      payload: await getPayloadClient(),
      sendVerification: createWebhookVerificationSender({
        secret: configuration.verificationWebhookSecret,
        url: configuration.verificationWebhookURL,
      }),
    })
  } catch {
    // Keep delivery and account existence non-enumerating.
  }
  return accepted()
}
