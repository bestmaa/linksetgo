import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { MEMBERSHIP_OWNER_OVERRIDE_CONTEXT } from '@/lib/server/membership-owner-guards'
import { analyticsSummaryCSV } from '@/lib/server/analytics-csv'
import { pruneExpiredLinkEvents } from '@/lib/server/analytics-retention-prune'
import { getAnalyticsSummary } from '@/lib/server/analytics-summary'
import type { App, DeepLink, Organization, User, Workspace } from '@/payload-types'

const FIXTURE = {
  apps: ['analytics-alpha-app', 'analytics-beta-app'],
  links: ['analytics-alpha-link', 'analytics-beta-link'],
  organizations: ['analytics-alpha', 'analytics-beta'],
  users: [
    'analytics-platform@relay.test',
    'analytics-alpha@relay.test',
    'analytics-beta@relay.test',
  ],
  workspaces: ['analytics-alpha-workspace', 'analytics-beta-workspace'],
} as const

const assertTestDatabase = (): void => {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is required for integration tests.')
  const name = decodeURIComponent(new URL(connectionString).pathname.slice(1))
  if (!name.endsWith('_test')) {
    throw new Error(`Refusing analytics integration cleanup against "${name}".`)
  }
}

describe.sequential('workspace analytics persistence', () => {
  let payload: Payload
  let userA: User
  let userB: User
  let organizationA: Organization
  let organizationB: Organization
  let workspaceA: Workspace
  let workspaceB: Workspace
  let appA: App
  let appB: App
  let linkA: DeepLink
  let linkB: DeepLink
  let oldEventID: number
  const previousEdition = process.env.RELAY_EDITION
  const previousRetention = process.env.ANALYTICS_RETENTION_DAYS

  const cleanup = async (): Promise<void> => {
    const apps = await payload.find({
      collection: 'apps',
      depth: 0,
      limit: 10,
      overrideAccess: true,
      pagination: false,
      where: { slug: { in: [...FIXTURE.apps] } },
    })
    const appIDs = apps.docs.map(({ id }) => id)
    if (appIDs.length > 0) {
      await payload.delete({
        collection: 'link-events',
        overrideAccess: true,
        where: { app: { in: appIDs } },
      })
      await payload.delete({
        collection: 'deep-links',
        overrideAccess: true,
        where: { app: { in: appIDs } },
      })
      await payload.delete({
        collection: 'apps',
        overrideAccess: true,
        where: { id: { in: appIDs } },
      })
    }
    const organizations = await payload.find({
      collection: 'organizations',
      depth: 0,
      limit: 10,
      overrideAccess: true,
      pagination: false,
      where: { slug: { in: [...FIXTURE.organizations] } },
    })
    const organizationIDs = organizations.docs.map(({ id }) => id)
    if (organizationIDs.length > 0) {
      await payload.delete({
        collection: 'organization-memberships',
        context: { [MEMBERSHIP_OWNER_OVERRIDE_CONTEXT]: true },
        overrideAccess: true,
        where: { organization: { in: organizationIDs } },
      })
      await payload.delete({
        collection: 'workspaces',
        overrideAccess: true,
        where: { organization: { in: organizationIDs } },
      })
      await payload.delete({
        collection: 'organizations',
        overrideAccess: true,
        where: { id: { in: organizationIDs } },
      })
    }
    await payload.delete({
      collection: 'users',
      overrideAccess: true,
      where: { email: { in: [...FIXTURE.users] } },
    })
  }

  beforeAll(async () => {
    assertTestDatabase()
    process.env.RELAY_EDITION = 'community'
    process.env.ANALYTICS_RETENTION_DAYS = '30'
    payload = await getPayload({ config: await config })
    await cleanup()

    await payload.create({
      collection: 'users',
      overrideAccess: true,
      data: {
        email: FIXTURE.users[0],
        name: 'Analytics platform operator',
        password: 'AnalyticsPlatformPassword123!',
        role: 'super-admin',
        status: 'active',
      },
    })
    ;[userA, userB] = await Promise.all([
      payload.create({
        collection: 'users',
        overrideAccess: true,
        data: {
          email: FIXTURE.users[1],
          name: 'Analytics user Alpha',
          password: 'AnalyticsPassword123!',
          role: 'admin',
          status: 'active',
        },
      }),
      payload.create({
        collection: 'users',
        overrideAccess: true,
        data: {
          email: FIXTURE.users[2],
          name: 'Analytics user Beta',
          password: 'AnalyticsPassword123!',
          role: 'admin',
          status: 'active',
        },
      }),
    ])
    ;[organizationA, organizationB] = await Promise.all([
      payload.create({
        collection: 'organizations',
        overrideAccess: true,
        data: {
          name: 'Analytics org Alpha',
          slug: FIXTURE.organizations[0],
          status: 'active',
        },
      }),
      payload.create({
        collection: 'organizations',
        overrideAccess: true,
        data: {
          name: 'Analytics org Beta',
          slug: FIXTURE.organizations[1],
          status: 'active',
        },
      }),
    ])
    ;[workspaceA, workspaceB] = await Promise.all([
      payload.create({
        collection: 'workspaces',
        overrideAccess: true,
        data: {
          name: 'Analytics Alpha',
          organization: organizationA.id,
          slug: FIXTURE.workspaces[0],
          status: 'active',
        },
      }),
      payload.create({
        collection: 'workspaces',
        overrideAccess: true,
        data: {
          name: 'Analytics Beta',
          organization: organizationB.id,
          slug: FIXTURE.workspaces[1],
          status: 'active',
        },
      }),
    ])
    await Promise.all([
      payload.create({
        collection: 'organization-memberships',
        overrideAccess: true,
        data: {
          organization: organizationA.id,
          role: 'owner',
          status: 'active',
          user: userA.id,
        },
      }),
      payload.create({
        collection: 'organization-memberships',
        overrideAccess: true,
        data: {
          organization: organizationB.id,
          role: 'owner',
          status: 'active',
          user: userB.id,
        },
      }),
    ])
    ;[appA, appB] = await Promise.all([
      payload.create({
        collection: 'apps',
        overrideAccess: true,
        data: {
          fallbackUrl: 'https://alpha.example/download',
          iosBundleId: 'com.example.analyticsalpha',
          iosTeamId: 'A1B2C3D4E5',
          name: '=Analytics Alpha',
          nativeScheme: 'analyticsalpha',
          slug: FIXTURE.apps[0],
          status: 'active',
          workspace: workspaceA.id,
        },
      }),
      payload.create({
        collection: 'apps',
        overrideAccess: true,
        data: {
          fallbackUrl: 'https://beta.example/download',
          iosBundleId: 'com.example.analyticsbeta',
          iosTeamId: 'A1B2C3D4E5',
          name: 'Analytics Beta',
          nativeScheme: 'analyticsbeta',
          slug: FIXTURE.apps[1],
          status: 'active',
          workspace: workspaceB.id,
        },
      }),
    ])
    ;[linkA, linkB] = await Promise.all([
      payload.create({
        collection: 'deep-links',
        overrideAccess: true,
        data: {
          app: appA.id,
          destinationPath: '/alpha',
          name: 'Alpha welcome',
          slug: FIXTURE.links[0],
          status: 'active',
        },
      }),
      payload.create({
        collection: 'deep-links',
        overrideAccess: true,
        data: {
          app: appB.id,
          destinationPath: '/beta',
          name: 'Beta welcome',
          slug: FIXTURE.links[1],
          status: 'active',
        },
      }),
    ])
    const oldEvent = await payload.create({
      collection: 'link-events',
      overrideAccess: true,
      data: {
        app: appA.id,
        eventType: 'resolved',
        hostname: 'alpha.links.example',
        link: linkA.id,
        occurredAt: '2026-05-01T12:00:00.000Z',
        platform: 'ios',
        sessionHash: 'analytics-old',
      },
    })
    oldEventID = oldEvent.id
    await Promise.all([
      payload.create({
        collection: 'link-events',
        overrideAccess: true,
        data: {
          app: appA.id,
          eventType: 'resolved',
          hostname: 'alpha.links.example',
          link: linkA.id,
          occurredAt: '2026-07-26T12:00:00.000Z',
          platform: 'ios',
          referrer: 'https://private.example',
          sessionHash: 'analytics-alpha-resolved',
          userAgent: 'Private user agent',
        },
      }),
      payload.create({
        collection: 'link-events',
        overrideAccess: true,
        data: {
          app: appA.id,
          eventType: 'app-opened',
          hostname: 'alpha.links.example',
          link: linkA.id,
          occurredAt: '2026-07-27T09:00:00.000Z',
          platform: 'android',
          sessionHash: 'analytics-alpha-opened',
        },
      }),
      payload.create({
        collection: 'link-events',
        overrideAccess: true,
        data: {
          app: appB.id,
          eventType: 'resolved',
          hostname: 'beta.links.example',
          link: linkB.id,
          occurredAt: '2026-07-27T09:00:00.000Z',
          platform: 'web',
          sessionHash: 'analytics-beta-resolved',
        },
      }),
    ])
  }, 60_000)

  afterAll(async () => {
    try {
      await cleanup()
    } finally {
      process.env.RELAY_EDITION = previousEdition
      process.env.ANALYTICS_RETENTION_DAYS = previousRetention
      await payload.destroy()
    }
  }, 60_000)

  it('aggregates only the selected workspace and clamps the retention range', async () => {
    const result = await getAnalyticsSummary(
      payload,
      userA,
      {
        from: '2026-05-01',
        hostname: 'ALPHA.LINKS.EXAMPLE',
        to: '2026-07-27',
        workspaceId: String(workspaceA.id),
      },
      new Date('2026-07-27T12:00:00.000Z'),
    )

    expect(result).toMatchObject({
      ok: true,
      value: {
        range: { retentionDays: 30, wasClamped: true },
        totalEvents: 2,
      },
    })
    if (!result.ok) throw new Error(result.message)
    expect(result.value.apps).toEqual([
      { count: 2, id: String(appA.id), label: '=Analytics Alpha' },
    ])
    expect(result.value.events).toEqual(
      expect.arrayContaining([
        { count: 1, id: 'app-opened', label: 'app-opened' },
        { count: 1, id: 'resolved', label: 'resolved' },
      ]),
    )
    expect(analyticsSummaryCSV(result.value)).toContain('"\'=Analytics Alpha"')
  })

  it('fails closed across tenants and never exposes raw event fields', async () => {
    await expect(
      getAnalyticsSummary(payload, userA, {
        workspaceId: String(workspaceB.id),
      }),
    ).resolves.toMatchObject({ code: 'NOT_FOUND', ok: false, status: 404 })

    const visible = await payload.find({
      collection: 'link-events',
      depth: 0,
      overrideAccess: false,
      user: userA,
    })
    expect(visible.docs).not.toHaveLength(0)
    expect(visible.docs.every((event) => event.app === appA.id)).toBe(true)
    expect(visible.docs[0]).not.toHaveProperty('sessionHash')
    expect(visible.docs[0]).not.toHaveProperty('referrer')
    expect(visible.docs[0]).not.toHaveProperty('userAgent')
    expect(visible.docs[0]).not.toHaveProperty('metadata')
  })

  it('dry-runs by default and deletes expired events only with explicit opt-in', async () => {
    const now = new Date('2026-07-27T12:00:00.000Z')
    const dryRun = await pruneExpiredLinkEvents(payload, {
      allowTestDatabase: true,
      now,
    })
    expect(dryRun).toMatchObject({ dryRun: true, totalDeleted: 0 })
    expect(dryRun.totalCandidates).toBeGreaterThanOrEqual(1)
    await expect(
      payload.findByID({
        collection: 'link-events',
        id: oldEventID,
        overrideAccess: true,
      }),
    ).resolves.toBeTruthy()

    const executed = await pruneExpiredLinkEvents(payload, {
      allowTestDatabase: true,
      dryRun: false,
      now,
    })
    expect(executed.totalDeleted).toBeGreaterThanOrEqual(1)
    await expect(
      payload.findByID({
        collection: 'link-events',
        id: oldEventID,
        overrideAccess: true,
      }),
    ).rejects.toMatchObject({ status: 404 })
  })
})
