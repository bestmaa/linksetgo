import type { App, DeepLink } from '@/payload-types'
import config from '@/payload.config'
import {
  evaluateLinkAvailability,
  projectPublicLink,
  type PublicLinkSuccess,
} from '@/lib/domain/public-link'
import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const APP_SLUG = 'relay-integration-api'
const LINK_SLUGS = {
  active: 'active-offer',
  expired: 'expired-offer',
  paused: 'paused-offer',
} as const

const assertTestDatabase = (): void => {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is required for integration tests.')

  const databaseName = decodeURIComponent(new URL(connectionString).pathname.slice(1))
  if (!databaseName.endsWith('_test')) {
    throw new Error(`Refusing to run integration cleanup against "${databaseName}".`)
  }
}

describe.sequential('Payload/PostgreSQL API', () => {
  let payload: Payload | undefined
  let app: App
  let links: Record<keyof typeof LINK_SLUGS, DeepLink>

  const resolveStoredLink = async (
    linkSlug: string,
    now = new Date(),
  ): Promise<
    | { ok: true; httpStatus: 200; body: PublicLinkSuccess }
    | {
        ok: false
        httpStatus: 410
        body: { status: 'unavailable'; error: { code: string } }
      }
  > => {
    const appResult = await payload!.find({
      collection: 'apps',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: { slug: { equals: APP_SLUG } },
    })
    const storedApp = appResult.docs[0]
    if (!storedApp) throw new Error('Integration app fixture was not found.')

    const linkResult = await payload!.find({
      collection: 'deep-links',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: {
        and: [{ app: { equals: storedApp.id } }, { slug: { equals: linkSlug } }],
      },
    })
    const storedLink = linkResult.docs[0]
    if (!storedLink) throw new Error(`Integration link fixture "${linkSlug}" was not found.`)

    const availability = evaluateLinkAvailability(storedApp, storedLink, now)
    return availability.status === 'active'
      ? {
          ok: true,
          httpStatus: 200,
          body: projectPublicLink(storedApp, storedLink, 'https://links.relay.test'),
        }
      : {
          ok: false,
          httpStatus: 410,
          body: { status: 'unavailable', error: { code: availability.code } },
        }
  }

  const cleanup = async (): Promise<void> => {
    if (!payload) return

    await payload.delete({
      collection: 'deep-links',
      overrideAccess: true,
      where: { slug: { in: Object.values(LINK_SLUGS) } },
    })
    await payload.delete({
      collection: 'apps',
      overrideAccess: true,
      where: { slug: { equals: APP_SLUG } },
    })
  }

  beforeAll(async () => {
    assertTestDatabase()
    payload = await getPayload({ config: await config })
    await cleanup()

    app = await payload.create({
      collection: 'apps',
      overrideAccess: true,
      data: {
        iosBundleId: 'com.example.relayintegration',
        iosTeamId: 'A1B2C3D4E5',
        name: 'Relay integration app',
        slug: APP_SLUG,
        status: 'active',
        fallbackUrl: 'https://fallback.relay.test/default',
        allowedFallbackHosts: ['allowed.relay.test'],
      },
    })

    const createLink = async (
      slug: string,
      status: 'active' | 'paused',
      expiresAt?: string,
    ): Promise<DeepLink> =>
      payload!.create({
        collection: 'deep-links',
        overrideAccess: true,
        data: {
          name: `Integration ${slug}`,
          app: app.id,
          slug,
          destinationPath: `/offers/${slug}`,
          fallbackUrl: 'https://allowed.relay.test/offer',
          status,
          ...(expiresAt ? { expiresAt } : {}),
        },
      })

    links = {
      active: await createLink(LINK_SLUGS.active, 'active'),
      expired: await createLink(LINK_SLUGS.expired, 'active', '2020-01-01T00:00:00.000Z'),
      paused: await createLink(LINK_SLUGS.paused, 'paused'),
    }
  })

  afterAll(async () => {
    if (!payload) return

    try {
      await cleanup()
    } finally {
      await payload.destroy()
    }
  })

  it('denies anonymous collection reads when access overrides are disabled', async () => {
    await Promise.all([
      expect(
        payload!.find({
          collection: 'apps',
          overrideAccess: false,
          where: { slug: { equals: APP_SLUG } },
        }),
      ).rejects.toMatchObject({ status: 403 }),
      expect(
        payload!.find({
          collection: 'deep-links',
          overrideAccess: false,
          where: { slug: { in: Object.values(LINK_SLUGS) } },
        }),
      ).rejects.toMatchObject({ status: 403 }),
    ])
  })

  it('normalizes the app fallback host and rejects a link fallback outside its allowlist', async () => {
    expect(app.allowedFallbackHosts).toEqual(
      expect.arrayContaining(['allowed.relay.test', 'fallback.relay.test']),
    )

    await expect(
      payload!.create({
        collection: 'deep-links',
        overrideAccess: true,
        data: {
          name: 'Blocked fallback',
          app: app.id,
          slug: 'blocked-fallback',
          destinationPath: '/blocked',
          fallbackUrl: 'https://untrusted.relay.test/redirect',
          status: 'active',
        },
      }),
    ).rejects.toThrow(/not allowed for this app/i)
  })

  it('resolves an active link through the public projection', async () => {
    const result = await resolveStoredLink(links.active.slug, new Date('2026-07-26T12:00:00.000Z'))

    expect(result).toMatchObject({
      ok: true,
      httpStatus: 200,
      body: {
        status: 'active',
        publicUrl: `https://links.relay.test/l/${APP_SLUG}/${LINK_SLUGS.active}`,
        app: { slug: APP_SLUG },
        link: { slug: LINK_SLUGS.active, status: 'active' },
      },
    })
    expect(result.body).not.toHaveProperty('link.id')
  })

  it.each([
    [LINK_SLUGS.paused, 'LINK_INACTIVE'],
    [LINK_SLUGS.expired, 'LINK_EXPIRED'],
  ] as const)('returns the expected unavailable result for %s', async (linkSlug, code) => {
    const result = await resolveStoredLink(linkSlug, new Date('2026-07-26T12:00:00.000Z'))

    expect(result).toMatchObject({
      ok: false,
      httpStatus: 410,
      body: { status: 'unavailable', error: { code } },
    })
  })

  it('rejects an otherwise active link while its app is paused', async () => {
    await payload!.update({
      collection: 'apps',
      id: app.id,
      overrideAccess: true,
      data: { status: 'paused' },
    })

    try {
      const result = await resolveStoredLink(LINK_SLUGS.active)

      expect(result).toMatchObject({
        ok: false,
        httpStatus: 410,
        body: { status: 'unavailable', error: { code: 'APP_INACTIVE' } },
      })
    } finally {
      app = await payload!.update({
        collection: 'apps',
        id: app.id,
        overrideAccess: true,
        data: { status: 'active' },
      })
    }
  })
})
