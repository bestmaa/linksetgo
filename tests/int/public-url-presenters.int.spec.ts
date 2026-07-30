import { describe, expect, it } from 'vitest'

import { presentAppDetail } from '@/features/app-detail/app-detail.presenter'
import { publicURLForLink } from '@/features/link-detail/link-detail.presenter'
import {
  presentOverviewHealth,
  presentOverviewRecentLink,
} from '@/features/overview/overview.presenter'
import type {
  AppConsoleDetailDTO,
  DeepLinkDTO,
  LinkConsoleDetailDTO,
} from '@/lib/client/payload-types'
import type { RuntimeLinkConfig } from '@/lib/domain/runtime-link-config'

const sharedConfig: RuntimeLinkConfig = {
  baseUrl: 'https://go.example.com',
  hostname: 'go.example.com',
  pathStyle: 'shared-clean',
  source: 'shared',
  workspaceId: '7',
}

const linkDetail = {
  app: {
    id: 2,
    name: 'Example app',
    nativeScheme: 'example',
    publicKey: 'example-global',
    slug: 'example',
    status: 'active',
  },
  effectiveStatus: 'active',
  link: {
    destinationPath: '/offer',
    expiresAt: null,
    fallbackUrl: null,
    id: 3,
    name: 'Offer',
    parameters: {},
    slug: 'offer',
    status: 'active',
  },
} satisfies LinkConsoleDetailDTO

const appDetail = {
  app: {
    id: 2,
    name: 'Example app',
    nativeScheme: 'example',
    publicKey: 'example-global',
    routingMode: 'scheme-handoff',
    slug: 'example',
    status: 'active',
  },
  links: [
    {
      destinationPath: '/offer',
      id: 3,
      name: 'Offer',
      slug: 'offer',
      status: 'active',
    },
  ],
  totalLinks: 1,
} satisfies AppConsoleDetailDTO

const overviewLink = {
  app: appDetail.app,
  destinationPath: '/offer',
  id: 3,
  name: 'Offer',
  slug: 'offer',
  status: 'active',
} satisfies DeepLinkDTO

describe('browser-visible public URL presenters', () => {
  it('keeps host-scoped links on the legacy /l path', () => {
    expect(publicURLForLink(linkDetail, 'https://example.links.test')).toBe(
      'https://example.links.test/l/example/offer',
    )
    expect(
      presentAppDetail(appDetail, 'Workspace', true, 'https://example.links.test').recentLinks[0]
        ?.publicUrl,
    ).toBe('https://example.links.test/l/example/offer')
  })

  it('keeps a legacy app without a public key usable on its host-scoped domain', () => {
    const legacy = {
      ...linkDetail,
      app: { ...linkDetail.app, publicKey: null },
    } satisfies LinkConsoleDetailDTO

    expect(publicURLForLink(legacy, 'https://legacy.links.test')).toBe(
      'https://legacy.links.test/l/example/offer',
    )
  })

  it('uses the permanent app public key for clean shared links', () => {
    expect(publicURLForLink(linkDetail, sharedConfig.baseUrl, sharedConfig.pathStyle)).toBe(
      'https://go.example.com/example-global/offer',
    )
    expect(
      presentAppDetail(appDetail, 'Workspace', true, sharedConfig.baseUrl, sharedConfig.pathStyle)
        .recentLinks[0]?.publicUrl,
    ).toBe('https://go.example.com/example-global/offer')
    expect(presentOverviewRecentLink(overviewLink, sharedConfig).url).toBe(
      'https://go.example.com/example-global/offer',
    )
  })

  it('does not advertise a broken shared link when an app has no public key', () => {
    const missingKey = {
      ...linkDetail,
      app: { ...linkDetail.app, publicKey: null },
    } satisfies LinkConsoleDetailDTO

    expect(publicURLForLink(missingKey, sharedConfig.baseUrl, sharedConfig.pathStyle)).toBeNull()
  })

  it('marks scheme-handoff apps as association-optional and the shared URL as ready', () => {
    const health = presentOverviewHealth([appDetail.app], sharedConfig, null)

    expect(health.find((item) => item.label === 'Shared domain')).toMatchObject({
      detail: expect.stringContaining('clean shared URLs ready'),
      tone: 'success',
    })
    expect(health.find((item) => item.label === 'Apple association')).toMatchObject({
      detail: expect.stringMatching(/optional.*scheme handoff/i),
      tone: 'success',
    })
    expect(health.find((item) => item.label === 'Android association')).toMatchObject({
      detail: expect.stringMatching(/optional.*scheme handoff/i),
      tone: 'success',
    })
  })
})
