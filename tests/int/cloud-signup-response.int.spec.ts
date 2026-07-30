import { afterEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  resendCalls: 0,
  scenario: 'success' as 'delivery-failure' | 'duplicate' | 'success',
}))

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: () => undefined }
})

vi.mock('@/lib/server/cloud-signup-config', () => ({
  getCloudSignupConfiguration: () => ({
    appBaseURL: 'https://app.linksetgo.test',
    emailDelivery: {
      mode: 'webhook',
      secret: 's'.repeat(32),
      url: 'https://mailer.linksetgo.test/email',
    },
    managedLinkRootDomain: null,
    sharedLinkBaseURL: 'https://go.linksetgo.test',
    status: 'ready',
  }),
}))

vi.mock('@/lib/server/cloud-signup-rate-limit', () => ({
  rateLimitCloudEmailDelivery: async () => ({
    allowed: true,
    remaining: 1,
    resetAt: new Date(Date.now() + 60_000).toISOString(),
  }),
  rateLimitCloudSignupRequest: async () => ({
    allowed: true,
    remaining: 1,
    resetAt: new Date(Date.now() + 60_000).toISOString(),
  }),
  rateLimitCloudSignupEmail: async () => ({
    allowed: true,
    remaining: 1,
    resetAt: new Date(Date.now() + 60_000).toISOString(),
  }),
}))

vi.mock('@/lib/server/cloud-account-email-outbox', () => ({
  queueCloudAccountEmailDelivery: async () => undefined,
}))

vi.mock('@/lib/server/cloud-account-email-sweep', () => ({
  runCloudAccountEmailOutboxSafely: async () => undefined,
}))

vi.mock('@/lib/server/env', () => ({
  getServerEnvironment: () => ({
    eventHashSecret: 'e'.repeat(32),
    trustProxyClientIPHeader: false,
  }),
}))

vi.mock('@/lib/server/payload-client', () => ({
  getPayloadClient: async () => ({}),
}))

vi.mock('@/lib/server/cloud-signup-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/cloud-signup-service')>()
  return {
    ...actual,
    createCloudSignup: async () => {
      if (state.scenario === 'delivery-failure') {
        throw new actual.CloudSignupError(
          'VERIFICATION_DELIVERY_FAILED',
          'Generic delivery failure.',
        )
      }
      if (state.scenario === 'duplicate') {
        throw new actual.CloudSignupError('EMAIL_UNAVAILABLE', 'Generic duplicate.')
      }
      return {
        email: 'owner@example.test',
        expiresAt: '2026-07-31T00:00:00.000Z',
        managedHostname: null,
        organizationID: '1',
        userID: '1',
        workspaceID: '1',
      }
    },
    resendCloudSignupVerification: async () => {
      state.resendCalls += 1
      return { deliveryAttempted: false }
    },
  }
})

import { POST } from '@/app/api/auth/signup/route'

const request = (): Request =>
  new Request('https://app.linksetgo.test/api/auth/signup', {
    body: JSON.stringify({
      acceptTerms: true,
      email: 'owner@example.test',
      name: 'Example Owner',
      organizationName: 'Example Organization',
      password: 'StrongPassword123!',
      workspaceSlug: 'example-organization',
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })

const responseProjection = async (
  scenario: typeof state.scenario,
): Promise<{ body: unknown; status: number }> => {
  state.scenario = scenario
  const response = await POST(request())
  return { body: await response.json(), status: response.status }
}

afterEach(() => {
  state.resendCalls = 0
  state.scenario = 'success'
})

describe('Cloud signup non-enumerating response', () => {
  it('returns the same accepted projection for success, a duplicate email, and delivery failure', async () => {
    const success = await responseProjection('success')
    const duplicate = await responseProjection('duplicate')
    const deliveryFailure = await responseProjection('delivery-failure')

    expect(duplicate).toEqual(success)
    expect(deliveryFailure).toEqual(success)
    expect(state.resendCalls).toBe(1)
    expect(success).toEqual({
      body: {
        message: 'Check your email to continue with LinksetGo Cloud.',
        status: 'verification-required',
      },
      status: 202,
    })
  })
})
