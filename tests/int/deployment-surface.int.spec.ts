import { describe, expect, it } from 'vitest'

import {
  decideDeploymentSurface,
  getDeploymentSurfaceConfig,
} from '@/lib/domain/deployment-surface'

const cloudConfig = getDeploymentSurfaceConfig({
  CLOUD_APP_BASE_URL: 'https://app.linksetgo.com',
  MANAGED_LINK_ROOT_DOMAIN: 'linksetgo.com',
  MARKETING_SITE_URL: 'https://linksetgo.com',
  RELAY_EDITION: 'cloud',
})

describe('deployment host surfaces', () => {
  it('keeps the Cloud app host focused on authentication and the console', () => {
    expect(
      decideDeploymentSurface({
        config: cloudConfig,
        hostname: 'app.linksetgo.com',
        pathname: '/',
      }),
    ).toEqual({ kind: 'redirect', destination: '/admin/login' })

    expect(
      decideDeploymentSurface({
        config: cloudConfig,
        hostname: 'app.linksetgo.com',
        pathname: '/pricing',
        search: '?currency=usd',
      }),
    ).toEqual({
      kind: 'redirect',
      destination: 'https://linksetgo.com/pricing?currency=usd',
    })
  })

  it('moves authentication from the marketing host to the app host', () => {
    expect(
      decideDeploymentSurface({
        config: cloudConfig,
        hostname: 'linksetgo.com',
        pathname: '/signup',
        search: '?plan=starter',
      }),
    ).toEqual({
      kind: 'redirect',
      destination: 'https://app.linksetgo.com/signup?plan=starter',
    })

    expect(
      decideDeploymentSurface({
        config: cloudConfig,
        hostname: 'linksetgo.com',
        method: 'POST',
        pathname: '/api/auth/signup',
      }),
    ).toEqual({ kind: 'deny' })
  })

  it('keeps explicitly configured local marketing and app hosts separate', () => {
    const localCloud = getDeploymentSurfaceConfig({
      CLOUD_APP_BASE_URL: 'http://127.0.0.1:3100',
      MANAGED_LINK_ROOT_DOMAIN: 'linksetgo.com',
      MARKETING_SITE_URL: 'http://localhost:3100',
      RELAY_EDITION: 'cloud',
    })

    expect(
      decideDeploymentSurface({
        config: localCloud,
        hostname: 'localhost',
        pathname: '/',
      }),
    ).toEqual({ kind: 'allow' })
    expect(
      decideDeploymentSurface({
        config: localCloud,
        hostname: '127.0.0.1',
        pathname: '/',
      }),
    ).toEqual({ kind: 'redirect', destination: '/admin/login' })
  })

  it('allows only the exact public methods and paths on workspace and custom domains', () => {
    for (const hostname of ['oberoi.linksetgo.com', 'links.customer.com']) {
      expect(
        decideDeploymentSurface({
          config: cloudConfig,
          hostname,
          pathname: '/l/mall/summer-offer',
        }),
      ).toEqual({ kind: 'allow' })
      expect(
        decideDeploymentSurface({
          config: cloudConfig,
          hostname,
          pathname: '/.well-known/apple-app-site-association',
        }),
      ).toEqual({ kind: 'allow' })
      expect(
        decideDeploymentSurface({
          config: cloudConfig,
          hostname,
          pathname: '/admin',
        }),
      ).toEqual({ kind: 'deny' })
      expect(
        decideDeploymentSurface({
          config: cloudConfig,
          hostname,
          pathname: '/pricing',
        }),
      ).toEqual({ kind: 'deny' })
      expect(
        decideDeploymentSurface({
          config: cloudConfig,
          hostname,
          method: 'POST',
          pathname: '/api/public/link-events',
        }),
      ).toEqual({ kind: 'allow' })
      expect(
        decideDeploymentSurface({
          config: cloudConfig,
          hostname,
          method: 'GET',
          pathname: '/api/public/link-events',
        }),
      ).toEqual({ kind: 'deny' })
    }
  })

  it('does not serve deep links from the Cloud app or marketing host', () => {
    for (const hostname of ['app.linksetgo.com', 'linksetgo.com']) {
      expect(
        decideDeploymentSurface({
          config: cloudConfig,
          hostname,
          pathname: '/l/mall/summer-offer',
        }),
      ).toEqual({ kind: 'deny' })
      expect(
        decideDeploymentSurface({
          config: cloudConfig,
          hostname,
          pathname: '/.well-known/assetlinks.json',
        }),
      ).toEqual({ kind: 'deny' })
    }
  })

  it('opens the Community console directly while isolating secondary public hosts', () => {
    const community = getDeploymentSurfaceConfig({
      PUBLIC_LINK_BASE_URL: 'https://links.example.com',
      RELAY_EDITION: 'community',
    })
    expect(
      decideDeploymentSurface({
        config: community,
        hostname: 'links.example.com',
        pathname: '/',
      }),
    ).toEqual({ kind: 'redirect', destination: '/admin/login' })
    expect(
      decideDeploymentSurface({
        config: community,
        hostname: 'links.example.com',
        pathname: '/l/app/link',
      }),
    ).toEqual({ kind: 'allow' })
    expect(
      decideDeploymentSurface({
        config: community,
        hostname: 'links.example.com',
        pathname: '/pricing',
      }),
    ).toEqual({ kind: 'redirect', destination: '/admin/settings' })

    expect(
      decideDeploymentSurface({
        config: community,
        hostname: 'customer.example.com',
        pathname: '/admin',
      }),
    ).toEqual({ kind: 'deny' })
    expect(
      decideDeploymentSurface({
        config: community,
        hostname: 'customer.example.com',
        pathname: '/l/app/link',
      }),
    ).toEqual({ kind: 'allow' })
  })

  it('fails safely when configured origins contain credentials or paths', () => {
    const config = getDeploymentSurfaceConfig({
      CLOUD_APP_BASE_URL: 'https://user:secret@app.linksetgo.com',
      MANAGED_LINK_ROOT_DOMAIN: 'linksetgo.com',
      MARKETING_SITE_URL: 'https://linksetgo.com/pricing',
      PUBLIC_LINK_BASE_URL: 'https://app.linksetgo.com',
      RELAY_EDITION: 'cloud',
    })
    expect(config.appOrigin).toBe('https://app.linksetgo.com')
    expect(config.marketingOrigin).toBe('https://linksetgo.com')
  })
})
