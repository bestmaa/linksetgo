import { describe, expect, it, vi } from 'vitest'

import { createWebhookFallbackOriginDNSProvider } from '@/lib/server/fallback-origin-dns-webhook'

const configuration = {
  secret: 'fallback-provider-secret-that-is-long-enough',
  status: 'ready',
  url: 'https://provisioner.example/hooks/domain',
} as const

describe('fallback-origin DNS webhook adapter', () => {
  it('sends one fixed TXT lookup and accepts bounded evidence', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({
        kind: 'success',
        value: {
          observedAt: '2026-07-27T08:00:00.000Z',
          values: ['relay-fallback-verification=expected'],
        },
      }),
    )
    const provider = createWebhookFallbackOriginDNSProvider(
      configuration,
      fetchMock as typeof fetch,
    )

    await expect(provider.lookupTXT('_relay-fallback.WWW.Company.Example.')).resolves.toEqual({
      observedAt: '2026-07-27T08:00:00.000Z',
      values: ['relay-fallback-verification=expected'],
    })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(configuration.url)
    expect(init).toMatchObject({
      body: JSON.stringify({
        action: 'lookup-txt',
        recordName: '_relay-fallback.www.company.example',
      }),
      method: 'POST',
      redirect: 'error',
    })
    expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${configuration.secret}`)
  })

  it('rejects arbitrary record names before contacting the webhook', async () => {
    const fetchMock = vi.fn()
    const provider = createWebhookFallbackOriginDNSProvider(
      configuration,
      fetchMock as typeof fetch,
    )

    await expect(provider.lookupTXT('_acme-challenge.company.example')).rejects.toThrow(
      /invalid TXT record name/i,
    )
    await expect(
      provider.lookupTXT('_relay-fallback.https://company.example/path'),
    ).rejects.toThrow(/invalid TXT record name/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects malformed, oversized, and unavailable provider responses', async () => {
    const malformed = createWebhookFallbackOriginDNSProvider(
      configuration,
      vi.fn(async () =>
        Response.json({ kind: 'success', value: { values: 'forged' } }),
      ) as unknown as typeof fetch,
    )
    const oversized = createWebhookFallbackOriginDNSProvider(
      configuration,
      vi.fn(
        async () =>
          new Response('{}', {
            headers: { 'content-length': String(16 * 1024 + 1) },
          }),
      ) as unknown as typeof fetch,
    )
    const unavailable = createWebhookFallbackOriginDNSProvider(
      configuration,
      vi.fn(async () => {
        throw new Error('private network details')
      }) as unknown as typeof fetch,
    )

    await expect(malformed.lookupTXT('_relay-fallback.company.example')).rejects.toThrow(
      /invalid evidence/i,
    )
    await expect(oversized.lookupTXT('_relay-fallback.company.example')).rejects.toThrow(
      /invalid evidence/i,
    )
    await expect(unavailable.lookupTXT('_relay-fallback.company.example')).rejects.toThrow(
      /provider is unavailable/i,
    )
  })
})
