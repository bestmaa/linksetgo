import { NextResponse } from 'next/server'

import { MAX_CLOUD_SIGNUP_BODY_BYTES, parseCloudSignupInput } from '@/lib/domain/cloud-signup'
import { readBoundedJSON } from '@/lib/server/bounded-json'
import { getCloudSignupConfiguration } from '@/lib/server/cloud-signup-config'
import {
  CloudSignupError,
  createCloudSignup,
  resendCloudSignupVerification,
} from '@/lib/server/cloud-signup-service'
import {
  rateLimitCloudSignupEmail,
  rateLimitCloudSignupRequest,
} from '@/lib/server/cloud-signup-rate-limit'
import { createWebhookVerificationSender } from '@/lib/server/cloud-verification-webhook'
import { getServerEnvironment } from '@/lib/server/env'
import { getPayloadClient } from '@/lib/server/payload-client'

const json = (body: unknown, status: number, headers?: HeadersInit): NextResponse =>
  NextResponse.json(body, {
    status,
    headers: { 'cache-control': 'no-store', ...headers },
  })

const rateLimited = (resetAt: string): NextResponse => {
  const seconds = Math.max(1, Math.ceil((new Date(resetAt).getTime() - Date.now()) / 1_000))
  return json(
    {
      status: 'error',
      error: { code: 'RATE_LIMITED', message: 'Too many signup attempts. Try again later.' },
    },
    429,
    { 'retry-after': String(seconds) },
  )
}

export async function POST(request: Request): Promise<NextResponse> {
  const signupConfiguration = getCloudSignupConfiguration()
  if (signupConfiguration.status === 'unavailable') {
    return json(
      {
        status: 'unavailable',
        error: { code: 'SIGNUP_UNAVAILABLE', message: 'Cloud signup is unavailable.' },
      },
      404,
    )
  }
  if (signupConfiguration.status === 'misconfigured') {
    return json(
      {
        status: 'unavailable',
        error: { code: 'SIGNUP_MISCONFIGURED', message: 'Cloud signup is unavailable.' },
      },
      503,
    )
  }

  const serverEnvironment = getServerEnvironment()
  const requestLimit = await rateLimitCloudSignupRequest({
    eventHashSecret: serverEnvironment.eventHashSecret,
    request,
    trustProxy: serverEnvironment.trustProxyClientIPHeader,
  })
  if (!requestLimit.allowed) return rateLimited(requestLimit.resetAt)

  const body = await readBoundedJSON(request, MAX_CLOUD_SIGNUP_BODY_BYTES)
  if (!body.ok) {
    const code =
      body.status === 413
        ? 'PAYLOAD_TOO_LARGE'
        : body.status === 415
          ? 'UNSUPPORTED_MEDIA_TYPE'
          : 'INVALID_JSON'
    return json(
      {
        status: 'error',
        error: { code, message: 'The signup request could not be processed.' },
      },
      body.status,
    )
  }

  const parsed = parseCloudSignupInput(body.value)
  if (!parsed.ok) {
    return json(
      {
        status: 'error',
        error: {
          code: 'INVALID_SIGNUP',
          field: parsed.field,
          message: parsed.message,
        },
      },
      400,
    )
  }

  const emailLimit = await rateLimitCloudSignupEmail({
    email: parsed.value.email,
    eventHashSecret: serverEnvironment.eventHashSecret,
  })
  if (!emailLimit.allowed) return rateLimited(emailLimit.resetAt)

  try {
    const payload = await getPayloadClient()
    await createCloudSignup(parsed.value, {
      appBaseURL: signupConfiguration.appBaseURL,
      managedLinkRootDomain: signupConfiguration.managedLinkRootDomain,
      payload,
      sendVerification: createWebhookVerificationSender({
        secret: signupConfiguration.verificationWebhookSecret,
        url: signupConfiguration.verificationWebhookURL,
      }),
    })
    return json(
      {
        status: 'verification-required',
        message: 'Check your email to verify your Relay Cloud account.',
      },
      202,
    )
  } catch (error) {
    if (error instanceof CloudSignupError) {
      if (error.code === 'EMAIL_UNAVAILABLE') {
        try {
          await resendCloudSignupVerification(parsed.value.email, {
            appBaseURL: signupConfiguration.appBaseURL,
            payload: await getPayloadClient(),
            sendVerification: createWebhookVerificationSender({
              secret: signupConfiguration.verificationWebhookSecret,
              url: signupConfiguration.verificationWebhookURL,
            }),
          })
        } catch {
          // The signup response intentionally hides account and delivery state.
        }
        return json(
          {
            status: 'verification-required',
            message: 'Check your email to continue with Relay Cloud.',
          },
          202,
        )
      }
      if (error.code === 'WORKSPACE_UNAVAILABLE') {
        return json(
          {
            status: 'error',
            error: {
              code: error.code,
              field: 'workspaceSlug',
              message: 'That workspace URL is unavailable.',
            },
          },
          409,
        )
      }
      if (error.code === 'SETUP_REQUIRED') {
        return json(
          {
            status: 'unavailable',
            error: { code: error.code, message: 'Cloud signup is temporarily unavailable.' },
          },
          503,
        )
      }
    }

    return json(
      {
        status: 'error',
        error: {
          code: 'SIGNUP_FAILED',
          message: 'We could not create the account. Please try again.',
        },
      },
      503,
    )
  }
}
