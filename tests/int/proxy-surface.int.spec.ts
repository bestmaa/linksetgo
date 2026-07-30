import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { proxy } from '@/proxy'

describe.sequential('request host surface proxy', () => {
  beforeEach(() => {
    vi.stubEnv('CLOUD_APP_BASE_URL', 'https://app.linksetgo.com')
    vi.stubEnv('MANAGED_LINK_ROOT_DOMAIN', 'linksetgo.com')
    vi.stubEnv('MARKETING_SITE_URL', 'https://linksetgo.com')
    vi.stubEnv('RELAY_EDITION', 'cloud')
    vi.stubEnv('SHARED_LINK_BASE_URL', 'https://go.linksetgo.com')
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

  it('allows clean public links but hides reserved surfaces on the shared host', () => {
    const cleanLink = proxy(
      new NextRequest('https://internal.example/oberoi/offer', {
        headers: { host: 'go.linksetgo.com' },
      }),
    )
    const hiddenConsole = proxy(
      new NextRequest('https://internal.example/admin/login', {
        headers: { host: 'go.linksetgo.com' },
      }),
    )

    expect(cleanLink.status).toBe(200)
    expect(cleanLink.headers.get('x-middleware-next')).toBe('1')
    expect(cleanLink.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive')
    expect(hiddenConsole.status).toBe(404)
  })

  it('allows only the restrictive robots route on the shared resolver host', () => {
    const response = proxy(
      new NextRequest('https://internal.example/robots.txt', {
        headers: { host: 'go.linksetgo.com' },
      }),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('x-middleware-next')).toBe('1')
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive')
  })

  it('denies generic Payload account mutation endpoints before route handling', () => {
    for (const pathname of [
      '/api/users/first-register',
      '/api/users/forgot-password',
      '/api/users/reset-password/',
      '/api/users/unlock',
      '/api/users/verify/opaque-token',
      '/api/%75sers/%66orgot-password',
    ]) {
      const response = proxy(
        new NextRequest(`https://internal.example${pathname}`, {
          headers: {
            host: 'app.linksetgo.com',
            'x-forwarded-host': 'go.linksetgo.com',
          },
          method: 'POST',
        }),
      )

      expect(response.status).toBe(404)
      expect(response.headers.get('x-middleware-next')).toBeNull()
    }
  })

  it('keeps required Payload session endpoints and custom auth routes on the app surface', () => {
    for (const route of [
      { method: 'GET', pathname: '/api/users/init' },
      { method: 'POST', pathname: '/api/users/login' },
      { method: 'POST', pathname: '/api/users/logout' },
      { method: 'GET', pathname: '/api/users/me' },
      { method: 'POST', pathname: '/api/users/refresh-token' },
      { method: 'POST', pathname: '/api/auth/forgot-password' },
      { method: 'POST', pathname: '/api/auth/reset-password' },
      { method: 'POST', pathname: '/api/auth/signup' },
    ]) {
      const response = proxy(
        new NextRequest(`https://internal.example${route.pathname}`, {
          headers: { host: 'app.linksetgo.com' },
          method: route.method,
        }),
      )

      expect(response.status).toBe(200)
      expect(response.headers.get('x-middleware-next')).toBe('1')
    }
  })
})
