import { describe, expect, it, vi } from 'vitest'

import { assessFallbackURL } from '@/lib/server/fallback-url-safety-service'
import {
  createWebhookFallbackURLSafetyProvider,
  getFallbackURLSafetyProviderConfiguration,
  getFallbackURLSafetyWebhookConfiguration,
} from '@/lib/server/fallback-url-safety-webhook'

const configuration = {
  maxAgeMs: 24 * 60 * 60 * 1_000,
  secret: 'fallback-url-safety-secret-that-is-long-enough',
  status: 'ready',
  url: 'https://scanner.example/hooks/url-safety',
} as const

describe('fallback URL safety provider', () => {
  it('fails closed on disabled, partial, or unsafe operator configuration', () => {
    expect(getFallbackURLSafetyWebhookConfiguration({})).toEqual({ status: 'disabled' })
    expect(
      getFallbackURLSafetyWebhookConfiguration({
        FALLBACK_URL_SAFETY_WEBHOOK_URL: configuration.url,
      }),
    ).toMatchObject({ status: 'misconfigured' })
    expect(
      getFallbackURLSafetyWebhookConfiguration({
        FALLBACK_URL_SAFETY_WEBHOOK_SECRET: configuration.secret,
        FALLBACK_URL_SAFETY_WEBHOOK_URL: 'http://scanner.example/check',
      }),
    ).toMatchObject({ status: 'misconfigured' })
    expect(
      getFallbackURLSafetyProviderConfiguration({
        FALLBACK_URL_SAFETY_WEBHOOK_SECRET: configuration.secret,
        FALLBACK_URL_SAFETY_WEBHOOK_URL: configuration.url,
        FALLBACK_URL_SAFETY_MAX_AGE_SECONDS: '60',
      }),
    ).toMatchObject({ available: false })
    expect(
      getFallbackURLSafetyProviderConfiguration({
        FALLBACK_URL_SAFETY_WEBHOOK_SECRET: configuration.secret,
        FALLBACK_URL_SAFETY_WEBHOOK_URL: configuration.url,
      }),
    ).toMatchObject({ available: true, maxAgeMs: 60 * 60 * 1_000 })
  })

  it('posts canonical input only to the fixed webhook and refuses redirects', async () => {
    const calls: string[] = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      calls.push(String(input))
      return Response.json({
        kind: 'safe',
        value: {
          observedAt: '2026-07-30T10:00:00.000Z',
          redirectCount: 1,
        },
      })
    })
    const provider = createWebhookFallbackURLSafetyProvider(
      configuration,
      fetchMock as typeof fetch,
    )

    await expect(provider.assessURL('https://fallback.example/download')).resolves.toEqual({
      kind: 'safe',
      observedAt: '2026-07-30T10:00:00.000Z',
      redirectCount: 1,
    })
    expect(calls).toEqual([configuration.url])
    const [, init] = fetchMock.mock.calls[0]!
    expect(init).toMatchObject({
      body: JSON.stringify({
        action: 'assess-url',
        url: 'https://fallback.example/download',
      }),
      method: 'POST',
      redirect: 'error',
    })
    expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${configuration.secret}`)
  })

  it('never contacts either endpoint for a non-canonical or private tenant URL', async () => {
    const fetchMock = vi.fn()
    const provider = createWebhookFallbackURLSafetyProvider(
      configuration,
      fetchMock as typeof fetch,
    )

    await expect(provider.assessURL('https://LOCALHOST/download')).resolves.toMatchObject({
      kind: 'error',
      retryable: false,
    })
    await expect(provider.assessURL('https://Fallback.Example/download')).resolves.toMatchObject({
      kind: 'error',
      retryable: false,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('bounds and sanitizes malformed, oversized, and threat responses', async () => {
    const oversized = createWebhookFallbackURLSafetyProvider(
      configuration,
      vi.fn(
        async () =>
          new Response('{}', {
            headers: { 'content-length': String(16 * 1024 + 1) },
          }),
      ) as unknown as typeof fetch,
    )
    await expect(oversized.assessURL('https://fallback.example/download')).resolves.toMatchObject({
      kind: 'error',
    })

    const unsafe = createWebhookFallbackURLSafetyProvider(
      configuration,
      vi.fn(async () =>
        Response.json({
          kind: 'unsafe',
          value: {
            observedAt: '2026-07-30T10:00:00.000Z',
            redirectCount: 2,
            threats: ['phishing'],
          },
        }),
      ) as unknown as typeof fetch,
    )
    await expect(unsafe.assessURL('https://fallback.example/download')).resolves.toEqual({
      kind: 'unsafe',
      observedAt: '2026-07-30T10:00:00.000Z',
      redirectCount: 2,
      threats: ['phishing'],
    })
  })

  it('runs the provider through the assessment service without direct tenant fetches', async () => {
    const assessed: string[] = []
    const result = await assessFallbackURL({
      maxAgeMs: 60 * 60 * 1_000,
      now: new Date('2026-07-30T10:00:01.000Z'),
      provider: {
        assessURL: async (url) => {
          assessed.push(url)
          return {
            kind: 'safe',
            observedAt: '2026-07-30T10:00:00.000Z',
            redirectCount: 0,
          }
        },
      },
      url: 'https://fallback.example/download',
      workspaceId: 'workspace-1',
    })
    expect(assessed).toEqual(['https://fallback.example/download'])
    expect(result).toMatchObject({
      ok: true,
      assessment: {
        expiresAt: '2026-07-30T11:00:01.000Z',
        status: 'safe',
        workspaceId: 'workspace-1',
      },
    })
  })
})
