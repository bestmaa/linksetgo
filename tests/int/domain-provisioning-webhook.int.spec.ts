import { describe, expect, it, vi } from 'vitest'

import {
  createWebhookDomainProvisioningProvider,
  getDomainProvisioningWebhookConfiguration,
} from '@/lib/server/domain-provisioning-webhook'

const readyConfiguration = {
  secret: 'domain-provider-secret-that-is-long-enough',
  status: 'ready',
  url: 'https://provisioner.example/hooks/domain',
} as const

describe('domain provisioning webhook configuration', () => {
  it('is disabled by default and fails closed on partial or unsafe configuration', () => {
    expect(getDomainProvisioningWebhookConfiguration({})).toEqual({ status: 'disabled' })
    expect(
      getDomainProvisioningWebhookConfiguration({
        DOMAIN_PROVISIONING_WEBHOOK_URL: readyConfiguration.url,
      }),
    ).toMatchObject({ status: 'misconfigured' })
    expect(
      getDomainProvisioningWebhookConfiguration({
        DOMAIN_PROVISIONING_WEBHOOK_SECRET: readyConfiguration.secret,
        DOMAIN_PROVISIONING_WEBHOOK_URL: 'http://provisioner.example/hook',
      }),
    ).toMatchObject({ status: 'misconfigured' })
    expect(
      getDomainProvisioningWebhookConfiguration({
        DOMAIN_PROVISIONING_WEBHOOK_SECRET: readyConfiguration.secret,
        DOMAIN_PROVISIONING_WEBHOOK_URL: readyConfiguration.url,
      }),
    ).toEqual(readyConfiguration)
  })
})

describe('domain provisioning webhook adapter', () => {
  it('sends only the normalized hostname and parses bounded DNS evidence', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({
        kind: 'success',
        value: {
          cnameTargets: ['ingress.linksetgo.example'],
          txtValues: ['linksetgo-domain-verification=token'],
        },
      }),
    )
    const provider = createWebhookDomainProvisioningProvider(
      readyConfiguration,
      fetchMock as typeof fetch,
    )

    await expect(provider.inspectDNS('links.brand.example')).resolves.toEqual({
      kind: 'success',
      value: {
        cnameTargets: ['ingress.linksetgo.example'],
        txtValues: ['linksetgo-domain-verification=token'],
      },
    })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(readyConfiguration.url)
    expect(init).toMatchObject({
      body: JSON.stringify({ action: 'inspect-dns', hostname: 'links.brand.example' }),
      method: 'POST',
      redirect: 'error',
    })
    expect(new Headers(init?.headers).get('authorization')).toBe(
      `Bearer ${readyConfiguration.secret}`,
    )
  })

  it('parses pending and ready certificate states but rejects malformed evidence', async () => {
    const responses = [
      Response.json({ kind: 'success', value: { kind: 'pending' } }),
      Response.json({
        kind: 'success',
        value: {
          certificateID: 'cert_123',
          kind: 'ready',
          renewsAt: '2027-07-27T00:00:00.000Z',
        },
      }),
      Response.json({ kind: 'success', value: { cnameTargets: 'not-an-array' } }),
    ]
    const provider = createWebhookDomainProvisioningProvider(
      readyConfiguration,
      vi.fn(async () => responses.shift()!) as unknown as typeof fetch,
    )

    await expect(provider.requestCertificate('links.brand.example')).resolves.toEqual({
      kind: 'success',
      value: { kind: 'pending' },
    })
    await expect(provider.requestCertificate('links.brand.example')).resolves.toMatchObject({
      kind: 'success',
      value: { certificateID: 'cert_123', kind: 'ready' },
    })
    await expect(provider.inspectDNS('links.brand.example')).resolves.toMatchObject({
      kind: 'error',
      retryable: true,
    })
  })

  it('converts network and oversized responses into retryable errors', async () => {
    const unavailable = createWebhookDomainProvisioningProvider(
      readyConfiguration,
      vi.fn(async () => {
        throw new Error('network details must not escape')
      }) as unknown as typeof fetch,
    )
    const oversized = createWebhookDomainProvisioningProvider(
      readyConfiguration,
      vi.fn(
        async () =>
          new Response('{}', {
            headers: { 'content-length': String(16 * 1024 + 1) },
          }),
      ) as unknown as typeof fetch,
    )

    await expect(unavailable.inspectDNS('links.brand.example')).resolves.toEqual({
      kind: 'error',
      message: 'Domain provisioning provider is unavailable.',
      retryable: true,
    })
    await expect(oversized.inspectDNS('links.brand.example')).resolves.toMatchObject({
      kind: 'error',
      retryable: true,
    })
  })

  it('rejects invalid hostnames before contacting the operator webhook', async () => {
    const fetchMock = vi.fn()
    const provider = createWebhookDomainProvisioningProvider(
      readyConfiguration,
      fetchMock as typeof fetch,
    )

    await expect(provider.inspectDNS('https://links.brand.example/path')).resolves.toEqual({
      kind: 'error',
      message: 'Domain provisioning received an invalid hostname.',
      retryable: false,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
