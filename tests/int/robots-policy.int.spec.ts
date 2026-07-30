import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const request = vi.hoisted(() => ({
  host: 'linksetgo.com',
}))

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: request.host }),
}))

import robots from '@/app/robots'

describe('host-scoped robots policy', () => {
  beforeEach(() => {
    vi.stubEnv('CLOUD_APP_BASE_URL', 'https://app.linksetgo.com')
    vi.stubEnv('MANAGED_LINK_ROOT_DOMAIN', 'linksetgo.com')
    vi.stubEnv('MARKETING_SITE_URL', 'https://linksetgo.com')
    vi.stubEnv('RELAY_EDITION', 'cloud')
    vi.stubEnv('SHARED_LINK_BASE_URL', 'https://go.linksetgo.com')
    vi.stubEnv('TRUST_PROXY_HOST_HEADER', 'false')
  })

  afterEach(() => vi.unstubAllEnvs())

  it('disallows every crawler path on the shared resolver host', async () => {
    request.host = 'go.linksetgo.com'

    await expect(robots()).resolves.toEqual({
      rules: {
        disallow: '/',
        userAgent: '*',
      },
    })
  })

  it('preserves the marketing sitemap policy on the canonical host', async () => {
    request.host = 'linksetgo.com'

    await expect(robots()).resolves.toEqual({
      rules: {
        allow: '/',
        disallow: ['/admin/', '/api/', '/cms/'],
        userAgent: '*',
      },
      sitemap: 'https://linksetgo.com/sitemap.xml',
    })
  })
})
