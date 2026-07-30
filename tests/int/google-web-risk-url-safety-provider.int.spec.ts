import { describe, expect, it, vi } from 'vitest'

import {
  createGoogleWebRiskURLSafetyProvider,
  getGoogleWebRiskConfiguration,
  googleWebRiskEndpoint,
  googleWebRiskThreatTypes,
} from '@/lib/server/google-web-risk-url-safety-provider'
import { getFallbackURLSafetyProviderConfiguration } from '@/lib/server/fallback-url-safety-webhook'

const apiKey = 'google-web-risk-test-key-with-safe-characters'
const canonicalURL = 'https://fallback.example/download'

describe('Google Web Risk fallback URL safety provider', () => {
  it('selects only a non-empty, bounded API key', () => {
    expect(getGoogleWebRiskConfiguration({})).toEqual({ status: 'disabled' })
    expect(getGoogleWebRiskConfiguration({ GOOGLE_WEB_RISK_API_KEY: '   ' })).toEqual({
      status: 'disabled',
    })
    expect(getGoogleWebRiskConfiguration({ GOOGLE_WEB_RISK_API_KEY: `bad\nkey` })).toMatchObject({
      status: 'misconfigured',
    })
    expect(getGoogleWebRiskConfiguration({ GOOGLE_WEB_RISK_API_KEY: apiKey })).toEqual({
      apiKey,
      status: 'ready',
    })
  })

  it('requires the sandboxed scanner after a clean Google reputation result', async () => {
    const destinations: string[] = []
    const observedAt = new Date().toISOString()
    const configured = getFallbackURLSafetyProviderConfiguration(
      {
        FALLBACK_URL_SAFETY_WEBHOOK_SECRET: 'custom-webhook-secret-that-is-long-enough',
        FALLBACK_URL_SAFETY_WEBHOOK_URL: 'https://scanner.example/url-safety',
        GOOGLE_WEB_RISK_API_KEY: apiKey,
      },
      vi.fn(async (input: RequestInfo | URL) => {
        destinations.push(String(input))
        return String(input).startsWith(googleWebRiskEndpoint)
          ? Response.json({})
          : Response.json({
              kind: 'safe',
              value: { observedAt, redirectCount: 2 },
            })
      }) as unknown as typeof fetch,
    )
    expect(configured).toMatchObject({ available: true, maxAgeMs: 60 * 60 * 1_000 })
    if (!configured.available) throw new Error('Expected configured provider.')
    await expect(configured.provider.assessURL(canonicalURL)).resolves.toMatchObject({
      kind: 'safe',
      redirectCount: 2,
    })
    expect(new URL(destinations[0]!).origin).toBe('https://webrisk.googleapis.com')
    expect(new URL(destinations[1]!).origin).toBe('https://scanner.example')
  })

  it('does not accept Google reputation lookup as a complete safe verdict', () => {
    expect(
      getFallbackURLSafetyProviderConfiguration({ GOOGLE_WEB_RISK_API_KEY: apiKey }),
    ).toMatchObject({
      available: false,
      message: expect.stringMatching(/only a reputation signal/i),
    })
  })

  it('uses only the fixed endpoint, all required threat types, and refuses redirects', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({}),
    )
    const provider = createGoogleWebRiskURLSafetyProvider(
      apiKey,
      fetchMock as typeof fetch,
      () => new Date('2026-07-30T10:00:00.000Z'),
    )

    await expect(provider.assessURL(canonicalURL)).resolves.toEqual({
      kind: 'safe',
      observedAt: '2026-07-30T10:00:00.000Z',
      redirectCount: 0,
    })
    const [request, init] = fetchMock.mock.calls[0]!
    const requestURL = new URL(String(request))
    expect(`${requestURL.origin}${requestURL.pathname}`).toBe(googleWebRiskEndpoint)
    expect(requestURL.searchParams.get('uri')).toBe(canonicalURL)
    expect(requestURL.searchParams.has('key')).toBe(false)
    expect(requestURL.searchParams.getAll('threatTypes')).toEqual([...googleWebRiskThreatTypes])
    expect(init).toMatchObject({ method: 'GET', redirect: 'error' })
    expect(new Headers(init?.headers).get('x-goog-api-key')).toBe(apiKey)
  })

  it('maps supported Google threats and honors the provider expiration', async () => {
    const provider = createGoogleWebRiskURLSafetyProvider(
      apiKey,
      vi.fn(async () =>
        Response.json({
          threat: {
            expireTime: '2026-07-30T10:30:00.000Z',
            threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE'],
          },
        }),
      ) as unknown as typeof fetch,
      () => new Date('2026-07-30T10:00:00.000Z'),
    )

    await expect(provider.assessURL(canonicalURL)).resolves.toEqual({
      expiresAt: '2026-07-30T10:30:00.000Z',
      kind: 'unsafe',
      observedAt: '2026-07-30T10:00:00.000Z',
      redirectCount: 0,
      threats: ['malware', 'social-engineering', 'unwanted-software'],
    })
  })

  it('fails closed without fetching non-canonical input', async () => {
    const fetchMock = vi.fn()
    const provider = createGoogleWebRiskURLSafetyProvider(apiKey, fetchMock as typeof fetch)

    const result = await provider.assessURL('https://Fallback.Example/download')
    expect(result).toMatchObject({ kind: 'error', retryable: false })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.kind === 'error' ? result.message : '').not.toContain(apiKey)
  })

  it('fails closed on unknown threats, expired evidence, and oversized responses', async () => {
    const providerFor = (body: unknown, headers?: HeadersInit) =>
      createGoogleWebRiskURLSafetyProvider(
        apiKey,
        vi.fn(async () =>
          Response.json(body, headers ? { headers } : undefined),
        ) as unknown as typeof fetch,
        () => new Date('2026-07-30T10:00:00.000Z'),
      )

    await expect(
      providerFor({
        threat: {
          expireTime: '2026-07-30T11:00:00.000Z',
          threatTypes: ['UNKNOWN'],
        },
      }).assessURL(canonicalURL),
    ).resolves.toMatchObject({ kind: 'error' })
    await expect(
      providerFor({
        threat: {
          expireTime: '2026-07-30T09:00:00.000Z',
          threatTypes: ['MALWARE'],
        },
      }).assessURL(canonicalURL),
    ).resolves.toMatchObject({ kind: 'error' })

    const oversized = createGoogleWebRiskURLSafetyProvider(
      apiKey,
      vi.fn(
        async () =>
          new Response('{}', {
            headers: { 'content-length': String(16 * 1024 + 1) },
          }),
      ) as unknown as typeof fetch,
    )
    await expect(oversized.assessURL(canonicalURL)).resolves.toMatchObject({
      kind: 'error',
      retryable: true,
    })
  })
})
