import { afterEach, describe, expect, it } from 'vitest'

import { getCanonicalSiteURL, getSourceCodeURL, getSponsorURL } from '../../src/lib/server/site-url'

const originalSiteURL = process.env.NEXT_PUBLIC_SITE_URL

afterEach(() => {
  if (originalSiteURL === undefined) {
    delete process.env.NEXT_PUBLIC_SITE_URL
  } else {
    process.env.NEXT_PUBLIC_SITE_URL = originalSiteURL
  }
})

describe('canonical site URL', () => {
  it('uses a configured HTTPS origin', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://relay.example'
    expect(getCanonicalSiteURL().toString()).toBe('https://relay.example/')
  })

  it('fails safely for non-web and malformed values', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'javascript:alert(1)'
    expect(getCanonicalSiteURL().toString()).toBe('http://localhost:3100/')

    process.env.NEXT_PUBLIC_SITE_URL = 'not a URL'
    expect(getCanonicalSiteURL().toString()).toBe('http://localhost:3100/')
  })

  it('returns one credential-free origin without a path, query, or fragment', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://relay.example/console?tab=apps#top'
    expect(getCanonicalSiteURL().toString()).toBe('https://relay.example/')

    process.env.NEXT_PUBLIC_SITE_URL = 'https://user:secret@relay.example'
    expect(getCanonicalSiteURL().toString()).toBe('http://localhost:3100/')

    process.env.NEXT_PUBLIC_SITE_URL = 'http://relay.example'
    expect(getCanonicalSiteURL().toString()).toBe('http://localhost:3100/')
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
