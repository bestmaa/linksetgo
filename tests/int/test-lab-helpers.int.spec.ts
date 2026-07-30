import { afterEach, describe, expect, it, vi } from 'vitest'

import { validateAssociation } from '@/features/test-lab/association-validator'
import {
  buildSavedLinkOptions,
  parseLinksetGoUrl,
  platformsFor,
  qrDownloadBaseName,
  safeLinksetGoUrl,
} from '@/features/test-lab/test-lab-controller.helpers'
import type { AppDTO, DeepLinkDTO } from '@/lib/client/payload-types'

const origin = 'https://links.example.com'
const app: AppDTO = {
  androidPackageName: 'com.example.shop',
  androidSha256CertFingerprints: ['AA:BB:CC'],
  fallbackUrl: 'https://example.com/download',
  id: 7,
  iosBundleId: 'com.example.shop',
  iosTeamId: 'TEAM123456',
  name: 'Example Shop',
  publicKey: 'example-shop-global',
  slug: 'example-shop',
}
const link: DeepLinkDTO = {
  app,
  destinationPath: '/offers/welcome',
  id: 11,
  name: 'Welcome offer',
  slug: 'welcome-offer',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Test Lab controller helpers', () => {
  it('accepts only the configured canonical LinksetGo URL shape', () => {
    expect(parseLinksetGoUrl(`${origin}/l/example-shop/welcome-offer`, origin)).toEqual({
      appSlug: 'example-shop',
      linkSlug: 'welcome-offer',
      origin,
      url: `${origin}/l/example-shop/welcome-offer`,
    })
    expect(safeLinksetGoUrl(`${origin}/l/example-shop/welcome-offer/`, origin)).toBe(
      `${origin}/l/example-shop/welcome-offer`,
    )

    expect(() =>
      parseLinksetGoUrl('https://attacker.example/l/example-shop/welcome-offer', origin),
    ).toThrow(/configured link domain/i)
    expect(() =>
      parseLinksetGoUrl(`${origin}/l/example-shop/welcome-offer?campaign=sale`, origin),
    ).toThrow(/without query parameters/i)

    expect(
      parseLinksetGoUrl(`${origin}/example-shop-global/welcome-offer`, origin, 'shared-clean'),
    ).toEqual({
      appSlug: 'example-shop-global',
      linkSlug: 'welcome-offer',
      origin,
      url: `${origin}/example-shop-global/welcome-offer`,
    })
    expect(
      safeLinksetGoUrl(`${origin}/example-shop-global/welcome-offer/`, origin, 'shared-clean'),
    ).toBe(`${origin}/example-shop-global/welcome-offer`)
    expect(() =>
      parseLinksetGoUrl(`${origin}/l/example-shop/welcome-offer`, origin, 'shared-clean'),
    ).toThrow(/exactly \/\{app\}\/\{link\}/i)
  })

  it('builds saved-link options from populated and identifier app relations', () => {
    const relationLink: DeepLinkDTO = {
      ...link,
      app: app.id,
      id: 12,
      name: 'Rewards',
      slug: 'rewards',
    }
    expect(buildSavedLinkOptions([link, relationLink], [app], origin)).toEqual([
      {
        id: '11',
        label: 'Example Shop / Welcome offer',
        url: `${origin}/l/example-shop/welcome-offer`,
      },
      {
        id: '12',
        label: 'Example Shop / Rewards',
        url: `${origin}/l/example-shop/rewards`,
      },
    ])
    expect(buildSavedLinkOptions([link, relationLink], [app], origin, 'shared-clean')).toEqual([
      {
        id: '11',
        label: 'Example Shop / Welcome offer',
        url: `${origin}/example-shop-global/welcome-offer`,
      },
      {
        id: '12',
        label: 'Example Shop / Rewards',
        url: `${origin}/example-shop-global/rewards`,
      },
    ])
  })

  it('expands the both-platform workflow and creates stable QR filenames', () => {
    expect(platformsFor('both')).toEqual(['ios', 'android'])
    expect(platformsFor('ios')).toEqual(['ios'])
    expect(qrDownloadBaseName(`${origin}/l/example-shop/welcome-offer`)).toBe(
      'linksetgo-example-shop-welcome-offer',
    )
  })

  it('returns a copy-ready Apple association remediation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ applinks: { details: [] } }), {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        }),
      ),
    )

    const result = await validateAssociation(origin, 'ios', app)

    expect(result).toMatchObject({
      copyLabel: 'Copy expected AASA entry',
      passed: false,
      remediation: expect.stringMatching(/applinks\.details/i),
    })
    expect(result.copyValue).toContain('TEAM123456.com.example.shop')
    expect(result.copyValue).toContain('/l/example-shop/*')
  })

  it('uses the clean shared app key in Apple association remediation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ applinks: { details: [] } }), {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        }),
      ),
    )

    const result = await validateAssociation(origin, 'ios', app, 'shared-clean')

    expect(result).toMatchObject({
      copyLabel: 'Copy expected AASA entry',
      passed: false,
    })
    expect(result.copyValue).toContain('/example-shop-global/*')
    expect(result.copyValue).not.toContain('/l/example-shop/')
  })

  it('returns a copy-ready Android association remediation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify([]), {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        }),
      ),
    )

    const result = await validateAssociation(origin, 'android', app)

    expect(result).toMatchObject({
      copyLabel: 'Copy expected Asset Links entry',
      passed: false,
      remediation: expect.stringMatching(/assetlinks\.json/i),
    })
    expect(result.copyValue).toContain('com.example.shop')
    expect(result.copyValue).toContain('AA:BB:CC')
  })

  it('treats platform association as optional for scheme-handoff apps', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      validateAssociation(origin, 'ios', { ...app, routingMode: 'scheme-handoff' }, 'shared-clean'),
    ).resolves.toMatchObject({
      detail: expect.stringMatching(/optional.*scheme handoff/i),
      passed: true,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
