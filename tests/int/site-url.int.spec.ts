import { afterEach, describe, expect, it } from 'vitest'

import {
  getApplicationSiteURL,
  getCanonicalSiteURL,
  getMarketingSiteURL,
  getSourceCodeURL,
  getSponsorURL,
} from '../../src/lib/server/site-url'

const environmentNames = [
  'CLOUD_APP_BASE_URL',
  'MARKETING_SITE_URL',
  'NEXT_PUBLIC_SITE_URL',
  'PUBLIC_LINK_BASE_URL',
  'RELAY_EDITION',
] as const
const originalEnvironment = Object.fromEntries(
  environmentNames.map((name) => [name, process.env[name]]),
) as Record<(typeof environmentNames)[number], string | undefined>

afterEach(() => {
  for (const name of environmentNames) {
    const value = originalEnvironment[name]
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
})

describe('trusted site URLs', () => {
  it('keeps the marketing and Cloud application origins separate', () => {
    const environment = {
      CLOUD_APP_BASE_URL: 'https://app.linksetgo.com',
      NEXT_PUBLIC_SITE_URL: 'https://linksetgo.com',
      PUBLIC_LINK_BASE_URL: 'https://legacy.linksetgo.com',
      RELAY_EDITION: 'cloud',
    }

    expect(getMarketingSiteURL(environment).toString()).toBe('https://linksetgo.com/')
    expect(getApplicationSiteURL(environment).toString()).toBe('https://app.linksetgo.com/')
  })

  it('allows an explicit safe marketing origin without changing the app origin', () => {
    const environment = {
      CLOUD_APP_BASE_URL: 'https://app.linksetgo.com',
      MARKETING_SITE_URL: 'https://www.linksetgo.com',
      NEXT_PUBLIC_SITE_URL: 'https://linksetgo.com',
      PUBLIC_LINK_BASE_URL: 'https://legacy.linksetgo.com',
      RELAY_EDITION: 'cloud',
    }

    expect(getMarketingSiteURL(environment).origin).toBe('https://www.linksetgo.com')
    expect(getApplicationSiteURL(environment).origin).toBe('https://app.linksetgo.com')
  })

  it('uses the installation origin for a Community application', () => {
    expect(
      getApplicationSiteURL({
        CLOUD_APP_BASE_URL: 'https://ignored.example',
        NEXT_PUBLIC_SITE_URL: 'https://docs.example',
        PUBLIC_LINK_BASE_URL: 'https://links.example',
        RELAY_EDITION: 'community',
      }).toString(),
    ).toBe('https://links.example/')
  })

  it('falls through malformed or unsafe values to another trusted origin', () => {
    expect(
      getMarketingSiteURL({
        NEXT_PUBLIC_SITE_URL: 'javascript:alert(1)',
        PUBLIC_LINK_BASE_URL: 'https://links.example',
      }).toString(),
    ).toBe('https://links.example/')

    expect(
      getApplicationSiteURL({
        CLOUD_APP_BASE_URL: 'https://user:secret@app.example',
        NEXT_PUBLIC_SITE_URL: 'https://marketing.example',
        PUBLIC_LINK_BASE_URL: 'https://app.example',
        RELAY_EDITION: 'cloud',
      }).toString(),
    ).toBe('https://app.example/')
  })

  it('returns one credential-free origin without a path, query, or fragment', () => {
    expect(
      getMarketingSiteURL({
        NEXT_PUBLIC_SITE_URL: 'https://relay.example/console?tab=apps#top',
      }).toString(),
    ).toBe('https://relay.example/')
    expect(
      getMarketingSiteURL({
        NEXT_PUBLIC_SITE_URL: 'https://user:secret@relay.example',
      }).toString(),
    ).toBe('http://localhost:3100/')
    expect(getMarketingSiteURL({ NEXT_PUBLIC_SITE_URL: 'http://relay.example' }).toString()).toBe(
      'http://localhost:3100/',
    )
    expect(
      getApplicationSiteURL({
        PUBLIC_LINK_BASE_URL: 'http://127.0.0.1:3100/console',
        RELAY_EDITION: 'community',
      }).toString(),
    ).toBe('http://127.0.0.1:3100/')
  })

  it('keeps the canonical helper as a marketing-origin compatibility alias', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://linksetgo.com'
    process.env.PUBLIC_LINK_BASE_URL = 'https://app.linksetgo.com'
    expect(getCanonicalSiteURL().toString()).toBe('https://linksetgo.com/')
  })

  it('accepts only credential-free HTTPS sponsorship URLs', () => {
    expect(getSponsorURL('https://github.com/sponsors/example')).toBe(
      'https://github.com/sponsors/example',
    )
    expect(getSponsorURL('http://example.com/donate')).toBeNull()
    expect(getSponsorURL('https://user:secret@example.com/donate')).toBeNull()
  })

  it('accepts only a credential-free HTTPS Corresponding Source URL', () => {
    expect(getSourceCodeURL('https://github.com/example/relay')).toBe(
      'https://github.com/example/relay',
    )
    expect(getSourceCodeURL('http://github.com/example/relay')).toBeNull()
    expect(getSourceCodeURL('https://token@example.com/source')).toBeNull()
  })
})
