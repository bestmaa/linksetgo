import { NextResponse } from 'next/server'

import {
  MAX_ACCOUNT_RECOVERY_BODY_BYTES,
  parseAccountEmailRequest,
} from '@/lib/domain/account-recovery'
import { requestCloudPasswordReset } from '@/lib/server/account-recovery-service'
import { readBoundedJSON } from '@/lib/server/bounded-json'
import { getCloudAccountRecoveryConfiguration } from '@/lib/server/cloud-signup-config'
import {
  rateLimitPasswordRecoveryEmail,
  rateLimitPasswordRecoveryRequest,
} from '@/lib/server/cloud-signup-rate-limit'
import { createWebhookPasswordResetSender } from '@/lib/server/cloud-verification-webhook'
import { getServerEnvironment } from '@/lib/server/env'
import { getPayloadClient } from '@/lib/server/payload-client'

const json = (body: unknown, status: number, headers?: HeadersInit): NextResponse =>
  NextResponse.json(body, {
    status,
    headers: { 'cache-control': 'no-store', ...headers },
  })

const limited = (resetAt: string): NextResponse => {
  const seconds = Math.max(1, Math.ceil((Date.parse(resetAt) - Date.now()) / 1_000))
  return json(
    { status: 'error', error: { code: 'RATE_LIMITED', message: 'Try again later.' } },
    429,
    { 'retry-after': String(seconds) },
  )
}

export async function POST(request: Request): Promise<NextResponse> {
  const configuration = getCloudAccountRecoveryConfiguration()
  if (configuration.status !== 'ready') {
    return json(
      {
        status: 'unavailable',
        error: { code: 'RECOVERY_UNAVAILABLE', message: 'Account recovery is unavailable.' },
      },
      configuration.status === 'misconfigured' ? 503 : 404,
    )
  }

  const environment = getServerEnvironment()
  const requestLimit = await rateLimitPasswordRecoveryRequest({
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
  const emailLimit = await rateLimitPasswordRecoveryEmail({
    email: parsed.email,
    eventHashSecret: environment.eventHashSecret,
  })
  if (!emailLimit.allowed) return limited(emailLimit.resetAt)

  try {
    await requestCloudPasswordReset({
      appBaseURL: configuration.appBaseURL,
      email: parsed.email,
      payload: await getPayloadClient(),
      sendReset: createWebhookPasswordResetSender({
        secret: configuration.verificationWebhookSecret,
        url: configuration.verificationWebhookURL,
      }),
    })
  } catch {
    // The public response must not reveal whether delivery or lookup failed.
  }
  return json(
    {
      status: 'accepted',
      message: 'If an active account matches that email, a reset link is on its way.',
    },
    202,
  )
}
