import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createQuickLink: vi.fn(),
  rateLimitQuickLinkCreation: vi.fn(),
}))

vi.mock('payload', async (importOriginal) => {
  const actual = await importOriginal<typeof import('payload')>()
  return {
    ...actual,
    createLocalReq: async (options: { user: unknown }, payload: unknown) => ({
      payload,
      user: options.user,
    }),
  }
})
vi.mock('@/lib/server/env', () => ({
  getServerEnvironment: () => ({ eventHashSecret: 'route-test-secret' }),
}))
vi.mock('@/lib/server/payload-client', () => ({
  getPayloadClient: async () => ({
    auth: async () => ({ user: { id: 7, status: 'active' } }),
  }),
}))
vi.mock('@/lib/server/quick-link-rate-limit', () => ({
  rateLimitQuickLinkCreation: mocks.rateLimitQuickLinkCreation,
}))
vi.mock('@/lib/server/quick-link-service', () => ({
  createQuickLink: mocks.createQuickLink,
}))
vi.mock('@/lib/server/same-origin-mutation', () => ({
  isSameOriginMutation: () => true,
}))
vi.mock('@/lib/server/tenant-context', () => ({
  canAccessWorkspace: async () => true,
}))

import { POST } from '@/app/api/admin/quick-links/route'

const request = (): Request =>
  new Request('https://app.linksetgo.test/api/admin/quick-links', {
    body: JSON.stringify({
      nativeUrl: 'oberoi://home',
      workspaceId: '42',
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })

describe('quick-link route responses', () => {
  beforeEach(() => {
    mocks.createQuickLink.mockReset()
    mocks.rateLimitQuickLinkCreation.mockReset()
  })

  it('returns Retry-After and does not enter the service after the endpoint budget is exhausted', async () => {
    mocks.rateLimitQuickLinkCreation.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + 60_000).toISOString(),
    })

    const response = await POST(request())

    expect(response.status).toBe(429)
    expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0)
    await expect(response.json()).resolves.toEqual({
      error: { code: 'RATE_LIMITED', message: 'Too many link requests. Try again later.' },
    })
    expect(mocks.createQuickLink).not.toHaveBeenCalled()
  })

  it('preserves a typed service quota response', async () => {
    mocks.rateLimitQuickLinkCreation.mockResolvedValue({
      allowed: true,
      remaining: 29,
      resetAt: new Date(Date.now() + 60_000).toISOString(),
    })
    mocks.createQuickLink.mockResolvedValue({
      code: 'PLAN_LIMIT',
      message: 'Cloud Free has reached its activeLinks limit.',
      ok: false,
      status: 402,
    })

    const response = await POST(request())

    expect(response.status).toBe(402)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'PLAN_LIMIT',
        message: 'Cloud Free has reached its activeLinks limit.',
      },
    })
  })
})
