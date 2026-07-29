import { afterEach, describe, expect, it, vi } from 'vitest'

import { validateAssociation } from '@/features/test-lab/association-validator'
import {
  buildSavedLinkOptions,
  parseRelayUrl,
  platformsFor,
  qrDownloadBaseName,
  safeRelayUrl,
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
    expect(parseRelayUrl(`${origin}/l/example-shop/welcome-offer`, origin)).toEqual({
      appSlug: 'example-shop',
      linkSlug: 'welcome-offer',
      origin,
      url: `${origin}/l/example-shop/welcome-offer`,
    })
    expect(safeRelayUrl(`${origin}/l/example-shop/welcome-offer/`, origin)).toBe(
      `${origin}/l/example-shop/welcome-offer`,
    )

    expect(() =>
      parseRelayUrl('https://attacker.example/l/example-shop/welcome-offer', origin),
    ).toThrow(/configured link domain/i)
    expect(() =>
      parseRelayUrl(`${origin}/l/example-shop/welcome-offer?campaign=sale`, origin),
    ).toThrow(/without query parameters/i)
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
})
