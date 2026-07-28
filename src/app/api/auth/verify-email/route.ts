import { NextResponse } from 'next/server'

import { isCloudVerificationToken } from '@/lib/domain/cloud-verification-token'
import { readBoundedJSON } from '@/lib/server/bounded-json'
import { CloudSignupError, verifyCloudSignupEmail } from '@/lib/server/cloud-signup-service'
import { rateLimitCloudVerificationRequest } from '@/lib/server/cloud-signup-rate-limit'
import { getRelayEdition } from '@/lib/server/deployment-edition'
import { getServerEnvironment } from '@/lib/server/env'
import { getPayloadClient } from '@/lib/server/payload-client'

const json = (body: unknown, status: number, headers?: HeadersInit): NextResponse =>
  NextResponse.json(body, {
    status,
    headers: { 'cache-control': 'no-store', ...headers },
  })

export async function POST(request: Request): Promise<NextResponse> {
  if (getRelayEdition() !== 'cloud') {
    return json(
      {
        status: 'unavailable',
        error: { code: 'VERIFICATION_UNAVAILABLE', message: 'Email verification is unavailable.' },
      },
      404,
    )
  }

  const environment = getServerEnvironment()
  const limit = await rateLimitCloudVerificationRequest({
    eventHashSecret: environment.eventHashSecret,
    request,
    trustProxy: environment.trustProxyClientIPHeader,
  })
  if (!limit.allowed) {
    const seconds = Math.max(1, Math.ceil((new Date(limit.resetAt).getTime() - Date.now()) / 1_000))
    return json(
      {
        status: 'error',
        error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again later.' },
      },
      429,
      { 'retry-after': String(seconds) },
    )
  }

  const body = await readBoundedJSON(request, 2_048)
  if (
    !body.ok ||
    typeof body.value !== 'object' ||
    body.value === null ||
    Array.isArray(body.value) ||
    Object.keys(body.value).length !== 1 ||
    !isCloudVerificationToken((body.value as Record<string, unknown>).token)
  ) {
    return json(
      {
        status: 'error',
        error: { code: 'VERIFICATION_INVALID', message: 'This verification link is invalid.' },
      },
      400,
    )
  }

  try {
    const token = (body.value as { token: string }).token
    const result = await verifyCloudSignupEmail(token, await getPayloadClient())
    return json(
      {
        status: 'verified',
        email: result.email,
        workspaceSlug: result.workspaceSlug,
      },
      200,
    )
  } catch (error) {
    const status =
      error instanceof CloudSignupError &&
      (error.code === 'ATOMIC_SIGNUP_UNAVAILABLE' || error.code === 'VERIFICATION_FAILED')
        ? 503
        : 400
    return json(
      {
        status: 'error',
        error: { code: 'VERIFICATION_INVALID', message: 'This verification link is invalid.' },
      },
      status,
    )
  }
}
