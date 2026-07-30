import { describe, expect, it, vi } from 'vitest'

import {
  createWebhookFallbackOriginDNSProvider,
  getFallbackOriginDNSProviderConfiguration,
} from '@/lib/server/fallback-origin-dns-webhook'
import { createNodeFallbackOriginDNSProvider } from '@/lib/server/fallback-origin-dns-node'

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
          values: ['linksetgo-fallback-verification=expected'],
        },
      }),
    )
    const provider = createWebhookFallbackOriginDNSProvider(
      configuration,
      fetchMock as typeof fetch,
      () => new Date('2026-07-27T08:00:01.000Z'),
    )

    await expect(provider.lookupTXT('_linksetgo-fallback.WWW.Company.Example.')).resolves.toEqual({
      observedAt: '2026-07-27T08:00:00.000Z',
      values: ['linksetgo-fallback-verification=expected'],
    })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(configuration.url)
    expect(init).toMatchObject({
      body: JSON.stringify({
        action: 'lookup-txt',
        recordName: '_linksetgo-fallback.www.company.example',
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
      provider.lookupTXT('_linksetgo-fallback.https://company.example/path'),
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

    await expect(malformed.lookupTXT('_linksetgo-fallback.company.example')).rejects.toThrow(
      /invalid evidence/i,
    )
    await expect(oversized.lookupTXT('_linksetgo-fallback.company.example')).rejects.toThrow(
      /invalid evidence/i,
    )
    await expect(unavailable.lookupTXT('_linksetgo-fallback.company.example')).rejects.toThrow(
      /provider is unavailable/i,
    )
  })

  it('rejects replayed and implausibly future-dated webhook observations', async () => {
    const provider = (observedAt: string) =>
      createWebhookFallbackOriginDNSProvider(
        configuration,
        vi.fn(async () =>
          Response.json({
            kind: 'success',
            value: {
              observedAt,
              values: ['linksetgo-fallback-verification=expected'],
            },
          }),
        ) as unknown as typeof fetch,
        () => new Date('2026-07-30T10:10:00.000Z'),
      )

    await expect(
      provider('2026-07-30T10:04:59.999Z').lookupTXT('_linksetgo-fallback.company.example'),
    ).rejects.toThrow(/invalid evidence/i)
    await expect(
      provider('2026-07-30T10:12:00.001Z').lookupTXT('_linksetgo-fallback.company.example'),
    ).rejects.toThrow(/invalid evidence/i)
    await expect(
      provider('2026-07-30T10:05:00.000Z').lookupTXT('_linksetgo-fallback.company.example'),
    ).resolves.toMatchObject({ observedAt: '2026-07-30T10:05:00.000Z' })
  })
})

describe('built-in fallback-origin DNS provider', () => {
  it('normalizes only the fixed record, joins TXT chunks, and timestamps bounded evidence', async () => {
    const resolveTXT = vi.fn(async (_recordName: string) => [
      ['linksetgo-fallback-verification=', 'expected'],
      ['secondary-value'],
    ])
    const provider = createNodeFallbackOriginDNSProvider(
      resolveTXT,
      () => new Date('2026-07-30T12:00:00.000Z'),
    )

    await expect(provider.lookupTXT('_linksetgo-fallback.WWW.Company.Example.')).resolves.toEqual({
      observedAt: '2026-07-30T12:00:00.000Z',
      values: ['linksetgo-fallback-verification=expected', 'secondary-value'],
    })
    expect(resolveTXT).toHaveBeenCalledOnce()
    expect(resolveTXT).toHaveBeenCalledWith('_linksetgo-fallback.www.company.example')
  })

  it('rejects arbitrary names before DNS and treats a missing record as empty evidence', async () => {
    const missing = Object.assign(new Error('not found'), { code: 'ENODATA' })
    const resolveTXT = vi.fn(async () => Promise.reject(missing))
    const provider = createNodeFallbackOriginDNSProvider(
      resolveTXT,
      () => new Date('2026-07-30T12:00:00.000Z'),
    )

    await expect(provider.lookupTXT('_acme-challenge.company.example')).rejects.toThrow(
      /invalid TXT record name/i,
    )
    expect(resolveTXT).not.toHaveBeenCalled()
    await expect(provider.lookupTXT('_linksetgo-fallback.company.example')).resolves.toMatchObject({
      values: [],
    })
  })

  it('bounds evidence and fails closed on resolver timeout', async () => {
    const oversized = createNodeFallbackOriginDNSProvider(vi.fn(async () => [['x'.repeat(1_025)]]))
    const timedOut = createNodeFallbackOriginDNSProvider(
      vi.fn(async () => new Promise<string[][]>(() => undefined)),
      () => new Date(),
      5,
    )

    await expect(oversized.lookupTXT('_linksetgo-fallback.company.example')).rejects.toThrow(
      /too much evidence/i,
    )
    await expect(timedOut.lookupTXT('_linksetgo-fallback.company.example')).rejects.toThrow(
      /resolver is unavailable/i,
    )
  })

  it('uses a complete trusted webhook first and otherwise defaults Cloud to built-in DNS', () => {
    const builtIn = {
      lookupTXT: vi.fn(async () => ({
        observedAt: '2026-07-30T12:00:00.000Z',
        values: [],
      })),
    }
    expect(
      getFallbackOriginDNSProviderConfiguration(
        {
          DOMAIN_PROVISIONING_WEBHOOK_SECRET: configuration.secret,
          DOMAIN_PROVISIONING_WEBHOOK_URL: configuration.url,
          RELAY_EDITION: 'cloud',
        },
        builtIn,
      ),
    ).toMatchObject({ available: true, source: 'webhook' })
    expect(
      getFallbackOriginDNSProviderConfiguration({ RELAY_EDITION: 'cloud' }, builtIn),
    ).toMatchObject({ available: true, provider: builtIn, source: 'node-dns' })
    expect(
      getFallbackOriginDNSProviderConfiguration(
        {
          DOMAIN_PROVISIONING_WEBHOOK_URL: configuration.url,
          RELAY_EDITION: 'cloud',
        },
        builtIn,
      ),
    ).toMatchObject({ available: true, provider: builtIn, source: 'node-dns' })
    expect(getFallbackOriginDNSProviderConfiguration({}, builtIn)).toMatchObject({
      available: false,
    })
  })
})
