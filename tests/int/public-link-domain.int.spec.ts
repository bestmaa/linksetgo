import { describe, expect, it } from 'vitest'

import {
  buildPublicURL,
  evaluateLinkAvailability,
  isPublicSlug,
  projectPublicLink,
} from '@/lib/domain/public-link'
import type { App, DeepLink } from '@/payload-types'

const timestamp = '2026-07-26T00:00:00.000Z'

const makeApp = (overrides: Partial<App> = {}): App => ({
  id: 1,
  name: 'Shop',
  slug: 'shop',
  status: 'active',
  fallbackUrl: 'https://example.com/',
  allowedFallbackHosts: ['example.com'],
  createdAt: timestamp,
  updatedAt: timestamp,
  ...overrides,
})

const makeLink = (overrides: Partial<DeepLink> = {}): DeepLink => ({
  id: 2,
  name: 'Offer',
  app: 1,
  slug: 'offer',
  destinationPath: '/offers/42',
  parameters: { campaign: 'summer' },
  status: 'active',
  createdAt: timestamp,
  updatedAt: timestamp,
  ...overrides,
})

describe('public deep-link lifecycle', () => {
  it('accepts only canonical public slugs', () => {
    expect(isPublicSlug('summer-offer')).toBe(true)
    expect(isPublicSlug('../summer')).toBe(false)
    expect(isPublicSlug('Summer')).toBe(false)
  })

  it('rejects inactive apps and links', () => {
    const now = new Date('2026-07-26T12:00:00.000Z')
    expect(evaluateLinkAvailability(makeApp({ status: 'paused' }), makeLink(), now)).toEqual({
      status: 'unavailable',
      code: 'APP_INACTIVE',
    })
    expect(evaluateLinkAvailability(makeApp(), makeLink({ status: 'draft' }), now)).toEqual({
      status: 'unavailable',
      code: 'LINK_INACTIVE',
    })
  })

  it('rejects expired or malformed expiration dates', () => {
    const now = new Date('2026-07-26T12:00:00.000Z')
    expect(evaluateLinkAvailability(makeApp(), makeLink({ expiresAt: timestamp }), now)).toEqual({
      status: 'unavailable',
      code: 'LINK_EXPIRED',
    })
    expect(evaluateLinkAvailability(makeApp(), makeLink({ expiresAt: 'not-a-date' }), now)).toEqual(
      { status: 'unavailable', code: 'LINK_EXPIRED' },
    )
  })

  it('projects only the public contract', () => {
    const projection = projectPublicLink(
      makeApp({ iosTeamId: 'PRIVATE1234' }),
      makeLink(),
      'https://links.example.com/base?unsafe=true',
    )

    expect(projection.publicUrl).toBe('https://links.example.com/l/shop/offer')
    expect(projection).not.toHaveProperty('app.iosTeamId')
    expect(projection).not.toHaveProperty('link.id')
    expect(projection).not.toHaveProperty('link.createdAt')
  })

  it('projects a safe user-initiated native fallback without changing the public URL', () => {
    const projection = projectPublicLink(
      makeApp({ nativeScheme: 'example' }),
      makeLink({ parameters: { SlabName: 'Gold', promo: '10 OFF' } }),
      'https://links.example.com',
    )
    expect(projection.publicUrl).toBe('https://links.example.com/l/shop/offer')
    expect(projection.link.nativeUrl).toBe('example://offers/42?SlabName=Gold&promo=10+OFF')
  })

  it('fails closed when a legacy destination is unsafe for a native fallback', () => {
    const projection = projectPublicLink(
      makeApp({ nativeScheme: 'example' }),
      makeLink({ destinationPath: '/offers/%2e%2e/admin' }),
      'https://links.example.com',
    )
    expect(projection.link.nativeUrl).toBeNull()
  })

  it('never projects nested or oversized legacy parameters', () => {
    expect(
      projectPublicLink(
        makeApp(),
        makeLink({ parameters: { nested: { unsafe: true } } }),
        'https://links.example.com',
      ).link.parameters,
    ).toBeNull()
    expect(
      projectPublicLink(
        makeApp(),
        makeLink({ parameters: { campaign: 'summer', featured: true, page: 2 } }),
        'https://links.example.com',
      ).link.parameters,
    ).toEqual({ campaign: 'summer', featured: true, page: 2 })
  })

  it('builds a canonical URL without inherited query or hash', () => {
    expect(buildPublicURL('https://links.example.com/root?q=1#hash', 'shop', 'offer')).toBe(
      'https://links.example.com/l/shop/offer',
    )
  })
})
