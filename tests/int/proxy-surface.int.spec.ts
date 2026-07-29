import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { proxy } from '@/proxy'

describe.sequential('request host surface proxy', () => {
  beforeEach(() => {
    vi.stubEnv('CLOUD_APP_BASE_URL', 'https://app.linksetgo.com')
    vi.stubEnv('MANAGED_LINK_ROOT_DOMAIN', 'linksetgo.com')
    vi.stubEnv('MARKETING_SITE_URL', 'https://linksetgo.com')
    vi.stubEnv('RELAY_EDITION', 'cloud')
    vi.stubEnv('TRUST_PROXY_HOST_HEADER', 'false')
  })

  afterEach(() => vi.unstubAllEnvs())

  it('redirects app marketing paths only to the configured marketing origin', () => {
    const response = proxy(
      new NextRequest('https://internal.example/pricing?currency=usd', {
        headers: { host: 'app.linksetgo.com' },
      }),
    )

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://linksetgo.com/pricing?currency=usd')
  })

  it('ignores a forged forwarded host and hides the console on public candidates', () => {
    const response = proxy(
      new NextRequest('https://internal.example/admin', {
        headers: {
          host: 'example.linksetgo.com',
          'x-forwarded-host': 'app.linksetgo.com',
        },
      }),
    )

    expect(response.status).toBe(404)
    expect(response.headers.get('location')).toBeNull()
  })

  it('returns a bad request for malformed authorities', () => {
    const response = proxy(
      new NextRequest('https://internal.example/admin', {
        headers: { host: 'app.linksetgo.com:99999' },
      }),
    )

    expect(response.status).toBe(400)
  })

  it('allows the Docker readiness probe through the loopback host', () => {
    const response = proxy(
      new NextRequest('http://127.0.0.1:3000/api/health/ready', {
        headers: { host: '127.0.0.1:3000' },
      }),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })
})
