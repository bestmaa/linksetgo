import { NextResponse } from 'next/server'

import {
  MAX_ACCOUNT_RECOVERY_BODY_BYTES,
  parsePasswordResetRequest,
} from '@/lib/domain/account-recovery'
import { resetCloudPassword } from '@/lib/server/account-recovery-service'
import { readBoundedJSON } from '@/lib/server/bounded-json'
import { rateLimitPasswordResetRequest } from '@/lib/server/cloud-signup-rate-limit'
import { getLinksetGoEdition } from '@/lib/server/deployment-edition'
import { getServerEnvironment } from '@/lib/server/env'
import { getPayloadClient } from '@/lib/server/payload-client'

const json = (body: unknown, status: number, headers?: HeadersInit): NextResponse =>
  NextResponse.json(body, {
    status,
    headers: { 'cache-control': 'no-store', ...headers },
  })

export async function POST(request: Request): Promise<NextResponse> {
  if (getLinksetGoEdition() !== 'cloud') {
    return json(
      {
        status: 'unavailable',
        error: { code: 'RECOVERY_UNAVAILABLE', message: 'Account recovery is unavailable.' },
      },
      404,
    )
  }

  const environment = getServerEnvironment()
  const limit = await rateLimitPasswordResetRequest({
    eventHashSecret: environment.eventHashSecret,
    request,
    trustProxy: environment.trustProxyClientIPHeader,
  })
  if (!limit.allowed) {
    const seconds = Math.max(1, Math.ceil((Date.parse(limit.resetAt) - Date.now()) / 1_000))
    return json(
      { status: 'error', error: { code: 'RATE_LIMITED', message: 'Try again later.' } },
      429,
      { 'retry-after': String(seconds) },
    )
  }

  const body = await readBoundedJSON(request, MAX_ACCOUNT_RECOVERY_BODY_BYTES)
  const parsed = body.ok ? parsePasswordResetRequest(body.value) : null
  if (!body.ok || !parsed?.ok) {
    return json(
      {
        status: 'error',
        error: {
          code: 'RESET_INVALID',
          message: parsed && !parsed.ok ? parsed.message : 'This reset request is invalid.',
        },
      },
      body.ok ? 400 : body.status,
    )
  }

  try {
    await resetCloudPassword({
      eventHashSecret: environment.eventHashSecret,
      password: parsed.password,
      payload: await getPayloadClient(),
      token: parsed.token,
    })
    return json({ status: 'reset' }, 200)
  } catch {
    return json(
      {
        status: 'error',
        error: {
          code: 'RESET_INVALID',
          message: 'This reset link is invalid, expired, or already used.',
        },
      },
      400,
    )
  }
}
