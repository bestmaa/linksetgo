import { planCatalog } from '@/lib/domain/plan-catalog'
import { buildFallbackOriginInstructions } from '@/lib/domain/fallback-origin'
import { parseQuickLinkInput, type QuickLinkInput } from '@/lib/domain/quick-link'
import {
  ensureFallbackURLSafetyAssessment,
  runFallbackURLSafetyAssessment,
} from '@/lib/server/fallback-url-safety-service'
import {
  beginFallbackOriginVerification,
  revokeFallbackOrigin,
  verifyFallbackOriginWithProvider,
} from '@/lib/server/fallback-origin-lifecycle'
import { getServerEnvironment } from '@/lib/server/env'
import { MEMBERSHIP_OWNER_OVERRIDE_CONTEXT } from '@/lib/server/membership-owner-guards'
import { quickLinkPublicKeyCandidates } from '@/lib/server/quick-link-public-key'
import { createQuickLink } from '@/lib/server/quick-link-service'
import type { App, Organization, User, Workspace } from '@/payload-types'
import { createLocalReq, getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const FIXTURE = {
  organizationSlugs: [
    'quick-link-owner',
    'quick-link-intruder',
    'quick-link-collision-owner',
    'quick-link-collision-holder',
    'quick-link-quota',
    'quick-link-key-race-a',
    'quick-link-key-race-b',
  ],
  userEmails: [
    'quick-link-owner@linksetgo.test',
    'quick-link-intruder@linksetgo.test',
    'quick-link-collision-owner@linksetgo.test',
    'quick-link-collision-holder@linksetgo.test',
    'quick-link-quota@linksetgo.test',
    'quick-link-key-race-a@linksetgo.test',
    'quick-link-key-race-b@linksetgo.test',
  ],
} as const

type Tenant = {
  organization: Organization
  user: User
  workspace: Workspace
}

const originalEdition = process.env.RELAY_EDITION
const originalSharedLinkBaseURL = process.env.SHARED_LINK_BASE_URL

const assertTestDatabase = (): void => {
  const value = process.env.DATABASE_URL
  if (!value || !decodeURIComponent(new URL(value).pathname).endsWith('_test')) {
    throw new Error('Quick-link integration tests require the disposable _test database.')
  }
}

const parse = (value: unknown): QuickLinkInput => {
  const result = parseQuickLinkInput(value)
  if (!result.ok) throw new Error(`Invalid quick-link fixture: ${result.field}`)
  return result.value
}

const expectedQuickAppKey = (nativeScheme: string, workspaceId: number | string): string => {
  const candidate = quickLinkPublicKeyCandidates({
    eventHashSecret: getServerEnvironment().eventHashSecret,
    nativeScheme,
    workspaceId: String(workspaceId),
  })[0]
  if (!candidate) throw new Error('Quick-link fixture did not produce a public app key.')
  return candidate
}

describe.sequential('quick-link owner workflow', () => {
  let collision: Tenant
  let collisionHolder: Tenant
  let intruder: Tenant
  let keyRaceA: Tenant
  let keyRaceB: Tenant
  let owner: Tenant
  let payload: Payload
  let quota: Tenant
  let quotaApp: App

  const cleanup = async (): Promise<void> => {
    const organizations = await payload.find({
      collection: 'organizations',
      depth: 0,
      limit: 20,
      overrideAccess: true,
      pagination: false,
      where: { slug: { in: [...FIXTURE.organizationSlugs] } },
    })
    const organizationIDs = organizations.docs.map(({ id }) => id)
    if (organizationIDs.length === 0) {
      await payload.delete({
        collection: 'users',
        overrideAccess: true,
        where: { email: { in: [...FIXTURE.userEmails] } },
      })
      return
    }

    const workspaces = await payload.find({
      collection: 'workspaces',
      depth: 0,
      limit: 20,
      overrideAccess: true,
      pagination: false,
      where: { organization: { in: organizationIDs } },
    })
    const workspaceIDs = workspaces.docs.map(({ id }) => id)
    const apps =
      workspaceIDs.length === 0
        ? { docs: [] }
        : await payload.find({
            collection: 'apps',
            depth: 0,
            limit: 20,
            overrideAccess: true,
            pagination: false,
            where: { workspace: { in: workspaceIDs } },
          })
    const appIDs = apps.docs.map(({ id }) => id)
    if (workspaceIDs.length > 0) {
      await payload.delete({
        collection: 'fallback-url-safety-assessments',
        overrideAccess: true,
        where: { workspace: { in: workspaceIDs } },
      })
      await payload.delete({
        collection: 'fallback-origins',
        overrideAccess: true,
        where: { workspace: { in: workspaceIDs } },
      })
    }
    if (appIDs.length > 0) {
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
    await payload.delete({
      collection: 'subscriptions',
      overrideAccess: true,
      where: { organization: { in: organizationIDs } },
    })
    await payload.delete({
      collection: 'organization-memberships',
      context: { [MEMBERSHIP_OWNER_OVERRIDE_CONTEXT]: true },
      overrideAccess: true,
      where: { organization: { in: organizationIDs } },
    })
    if (workspaceIDs.length > 0) {
      await payload.delete({
        collection: 'workspaces',
        overrideAccess: true,
        where: { id: { in: workspaceIDs } },
      })
    }
    await payload.delete({
      collection: 'organizations',
      overrideAccess: true,
      where: { id: { in: organizationIDs } },
    })
    await payload.delete({
      collection: 'users',
      overrideAccess: true,
      where: { email: { in: [...FIXTURE.userEmails] } },
    })
  }

  const createTenant = async (index: number): Promise<Tenant> => {
    const organizationSlug = FIXTURE.organizationSlugs[index]
    const email = FIXTURE.userEmails[index]
    if (!organizationSlug || !email) throw new Error('Invalid quick-link tenant fixture.')
    const user = await payload.create({
      collection: 'users',
      data: {
        email,
        name: `Quick link owner ${index}`,
        password: 'QuickLinkOwnerPassword123!',
        role: 'viewer',
        status: 'active',
      },
      overrideAccess: true,
    })
    const organization = await payload.create({
      collection: 'organizations',
      data: {
        name: `Quick link organization ${index}`,
        slug: organizationSlug,
        status: 'active',
      },
      overrideAccess: true,
    })
    const workspace = await payload.create({
      collection: 'workspaces',
      data: {
        name: `Quick link workspace ${index}`,
        organization: organization.id,
        slug: `${organizationSlug}-workspace`,
        status: 'active',
      },
      overrideAccess: true,
    })
    await payload.create({
      collection: 'organization-memberships',
      data: {
        organization: organization.id,
        role: 'owner',
        status: 'active',
        user: user.id,
      },
      overrideAccess: true,
    })
    return { organization, user, workspace }
  }

  beforeAll(async () => {
    assertTestDatabase()
    process.env.SHARED_LINK_BASE_URL = 'https://go.linksetgo.test'
    process.env.RELAY_EDITION = 'community'
    const { default: config } = await import('@/payload.config')
    payload = await getPayload({ config: await config })
    await cleanup()

    const tenants = await Promise.all(
      FIXTURE.organizationSlugs.map((_, index) => createTenant(index)),
    )
    const [
      ownerTenant,
      intruderTenant,
      collisionTenant,
      collisionHolderTenant,
      quotaTenant,
      keyRaceATenant,
      keyRaceBTenant,
    ] = tenants
    if (
      !ownerTenant ||
      !intruderTenant ||
      !collisionTenant ||
      !collisionHolderTenant ||
      !quotaTenant ||
      !keyRaceATenant ||
      !keyRaceBTenant
    ) {
      throw new Error('Quick-link tenant setup did not create every fixture.')
    }
    owner = ownerTenant
    intruder = intruderTenant
    collision = collisionTenant
    collisionHolder = collisionHolderTenant
    quota = quotaTenant
    keyRaceA = keyRaceATenant
    keyRaceB = keyRaceBTenant

    await payload.create({
      collection: 'apps',
      data: {
        name: 'Existing collision target',
        nativeScheme: 'collisionapp',
        routingMode: 'scheme-handoff',
        slug: 'collisionapp',
        status: 'active',
        workspace: collision.workspace.id,
      },
      overrideAccess: true,
    })
    await payload.create({
      collection: 'apps',
      data: {
        name: 'Cross-candidate race key holder',
        nativeScheme: 'racekey-holder',
        publicKey: 'racekey',
        routingMode: 'scheme-handoff',
        slug: 'racekey-holder',
        status: 'active',
        workspace: collision.workspace.id,
      },
      overrideAccess: true,
    })
    await payload.create({
      collection: 'apps',
      data: {
        name: 'Reserved public key target',
        nativeScheme: 'admin',
        routingMode: 'scheme-handoff',
        slug: 'admin',
        status: 'active',
        workspace: collision.workspace.id,
      },
      overrideAccess: true,
    })
    await payload.create({
      collection: 'apps',
      data: {
        name: 'Same-workspace public key holder',
        nativeScheme: 'occupied',
        publicKey: 'collisionapp',
        routingMode: 'scheme-handoff',
        slug: 'occupied',
        status: 'active',
        workspace: collision.workspace.id,
      },
      overrideAccess: true,
    })
    await payload.create({
      collection: 'apps',
      data: {
        name: 'Different app conflict',
        nativeScheme: 'existingapp',
        publicKey: 'existingapp',
        routingMode: 'scheme-handoff',
        slug: 'existingapp',
        status: 'active',
        workspace: collisionHolder.workspace.id,
      },
      overrideAccess: true,
    })
    quotaApp = await payload.create({
      collection: 'apps',
      data: {
        name: 'Quota app',
        nativeScheme: 'quotaapp',
        publicKey: 'quotaapp',
        routingMode: 'scheme-handoff',
        slug: 'quotaapp',
        status: 'active',
        workspace: quota.workspace.id,
      },
      overrideAccess: true,
    })
    for (let index = 0; index < planCatalog.free.limits.activeLinks; index += 1) {
      await payload.create({
        collection: 'deep-links',
        data: {
          app: quotaApp.id,
          destinationPath: `/existing/${index}`,
          name: `Existing quota link ${index}`,
          slug: `existing-quota-link-${index}`,
          status: 'active',
        },
        overrideAccess: true,
      })
    }
    process.env.RELAY_EDITION = 'cloud'
  }, 30_000)

  afterAll(async () => {
    if (payload) {
      try {
        process.env.RELAY_EDITION = 'community'
        await cleanup()
      } finally {
        await payload.destroy()
      }
    }
    if (originalEdition === undefined) delete process.env.RELAY_EDITION
    else process.env.RELAY_EDITION = originalEdition
    if (originalSharedLinkBaseURL === undefined) delete process.env.SHARED_LINK_BASE_URL
    else process.env.SHARED_LINK_BASE_URL = originalSharedLinkBaseURL
  })

  it('creates the first scheme-handoff app and active clean shared link for a signup owner', async () => {
    const appKey = expectedQuickAppKey('oberoi', owner.workspace.id)
    const result = await createQuickLink({
      data: parse({
        nativeUrl: 'oberoi://rewards-detail?SlabName=Gold&SlabPromo=10OFF',
        workspaceId: String(owner.workspace.id),
      }),
      payload,
      user: owner.user,
    })

    expect(result).toEqual({
      ok: true,
      value: {
        appId: expect.any(String),
        appKey,
        fallbackStatus: 'not-requested',
        linkId: expect.any(String),
        linkSlug: 'rewards-detail',
        name: 'Rewards Detail',
        publicUrl: `https://go.linksetgo.test/${appKey}/rewards-detail`,
      },
    })
    if (!result.ok) throw new Error('Quick-link creation unexpectedly failed.')
    const [app, link] = await Promise.all([
      payload.findByID({
        collection: 'apps',
        id: Number(result.value.appId),
        depth: 0,
        overrideAccess: true,
      }),
      payload.findByID({
        collection: 'deep-links',
        id: Number(result.value.linkId),
        depth: 0,
        overrideAccess: true,
      }),
    ])
    expect(app).toMatchObject({
      name: 'Mobile app',
      nativeScheme: 'oberoi',
      publicKey: appKey,
      routingMode: 'scheme-handoff',
      status: 'active',
      workspace: owner.workspace.id,
    })
    expect(link).toMatchObject({
      app: app.id,
      destinationPath: '/rewards-detail',
      parameters: { SlabName: 'Gold', SlabPromo: '10OFF' },
      slug: 'rewards-detail',
      status: 'active',
    })
  })

  it('is idempotent when the same owner submits the same native URL again', async () => {
    const appKey = expectedQuickAppKey('oberoi', owner.workspace.id)
    const data = parse({
      nativeUrl: 'oberoi://rewards-detail?SlabName=Gold&SlabPromo=10OFF',
      workspaceId: String(owner.workspace.id),
    })
    const first = await createQuickLink({ data, payload, user: owner.user })
    const second = await createQuickLink({ data, payload, user: owner.user })

    expect(first).toEqual(second)
    expect(first).toEqual({
      ok: true,
      value: {
        appId: expect.any(String),
        appKey,
        fallbackStatus: 'not-requested',
        linkId: expect.any(String),
        linkSlug: 'rewards-detail',
        name: 'Rewards Detail',
        publicUrl: `https://go.linksetgo.test/${appKey}/rewards-detail`,
      },
    })
    if (!first.ok) throw new Error('Quick-link creation unexpectedly failed.')
    const apps = await payload.find({
      collection: 'apps',
      depth: 0,
      overrideAccess: true,
      pagination: false,
      where: { workspace: { equals: owner.workspace.id } },
    })
    const links = await payload.find({
      collection: 'deep-links',
      depth: 0,
      overrideAccess: true,
      pagination: false,
      where: { app: { equals: apps.docs[0]!.id } },
    })
    expect(apps.docs).toHaveLength(1)
    expect(links.docs).toHaveLength(1)
    expect(apps.docs[0]).toMatchObject({
      name: 'Mobile app',
      nativeScheme: 'oberoi',
      publicKey: appKey,
      routingMode: 'scheme-handoff',
      status: 'active',
      workspace: owner.workspace.id,
    })
    expect(links.docs[0]).toMatchObject({
      app: apps.docs[0]!.id,
      destinationPath: '/rewards-detail',
      parameters: { SlabName: 'Gold', SlabPromo: '10OFF' },
      slug: 'rewards-detail',
      status: 'active',
    })
  })

  it('serializes concurrent identical submissions and returns the committed winner', async () => {
    const appKey = expectedQuickAppKey('concurrentapp', intruder.workspace.id)
    const data = parse({
      nativeUrl: 'concurrentapp://concurrent-offer?campaign=summer',
      workspaceId: String(intruder.workspace.id),
    })
    const [first, second] = await Promise.all([
      createQuickLink({ data, payload, user: intruder.user }),
      createQuickLink({ data, payload, user: intruder.user }),
    ])

    expect(first).toEqual(second)
    expect(first).toMatchObject({
      ok: true,
      value: {
        appKey,
        linkSlug: 'concurrent-offer',
        publicUrl: `https://go.linksetgo.test/${appKey}/concurrent-offer`,
      },
    })
    const app = await payload.find({
      collection: 'apps',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      where: { workspace: { equals: intruder.workspace.id } },
    })
    const links = await payload.count({
      collection: 'deep-links',
      overrideAccess: true,
      where: {
        and: [{ app: { equals: app.docs[0]!.id } }, { slug: { equals: 'concurrent-offer' } }],
      },
    })
    expect(links.totalDocs).toBe(1)
  }, 30_000)

  it('keeps concurrent PayPal claims tenant-scoped across workspaces', async () => {
    const firstExpectedKey = expectedQuickAppKey('paypal', keyRaceA.workspace.id)
    const secondExpectedKey = expectedQuickAppKey('paypal', keyRaceB.workspace.id)
    const [first, second] = await Promise.all([
      createQuickLink({
        data: parse({
          nativeUrl: 'paypal://home',
          workspaceId: String(keyRaceA.workspace.id),
        }),
        payload,
        user: keyRaceA.user,
      }),
      createQuickLink({
        data: parse({
          nativeUrl: 'paypal://home',
          workspaceId: String(keyRaceB.workspace.id),
        }),
        payload,
        user: keyRaceB.user,
      }),
    ])

    expect(first).toMatchObject({ ok: true })
    expect(second).toMatchObject({ ok: true })
    if (!first.ok || !second.ok) {
      throw new Error('Concurrent public-key allocation unexpectedly failed.')
    }
    const allocatedKeys = [first.value.appKey, second.value.appKey]
    expect(allocatedKeys).toEqual([firstExpectedKey, secondExpectedKey])
    expect(new Set(allocatedKeys).size).toBe(2)
    expect(allocatedKeys).not.toContain('paypal')

    const apps = await payload.find({
      collection: 'apps',
      depth: 0,
      limit: 2,
      overrideAccess: true,
      pagination: false,
      where: { workspace: { in: [keyRaceA.workspace.id, keyRaceB.workspace.id] } },
    })
    expect(apps.docs).toHaveLength(2)
    expect(new Set(apps.docs.map((app) => app.publicKey)).size).toBe(2)
  }, 30_000)

  it('denies an active owner access to another organization workspace', async () => {
    await expect(
      createQuickLink({
        data: parse({
          nativeUrl: 'oberoi://offer',
          workspaceId: String(owner.workspace.id),
        }),
        payload,
        user: intruder.user,
      }),
    ).resolves.toEqual({
      code: 'FORBIDDEN',
      message: 'Select a workspace you are allowed to manage.',
      ok: false,
      status: 403,
    })
  })

  it('never grants the raw native scheme even when that exact key is already occupied', async () => {
    const appKey = expectedQuickAppKey('collisionapp', collision.workspace.id)
    const result = await createQuickLink({
      data: parse({
        nativeUrl: 'collisionapp://home',
        workspaceId: String(collision.workspace.id),
      }),
      payload,
      user: collision.user,
    })

    expect(result).toMatchObject({
      ok: true,
      value: {
        appKey,
        publicUrl: `https://go.linksetgo.test/${appKey}/home`,
      },
    })
  })

  it('skips a reserved shared-path segment and assigns a safe suffixed key', async () => {
    const appKey = expectedQuickAppKey('admin', collision.workspace.id)
    const result = await createQuickLink({
      data: parse({
        nativeUrl: 'admin://home',
        workspaceId: String(collision.workspace.id),
      }),
      payload,
      user: collision.user,
    })

    expect(result).toMatchObject({
      ok: true,
      value: {
        appKey,
        publicUrl: `https://go.linksetgo.test/${appKey}/home`,
      },
    })
  })

  it('preserves an explicit app conflict as HTTP 409', async () => {
    await expect(
      createQuickLink({
        data: parse({
          nativeUrl: 'differentapp://home',
          workspaceId: String(collisionHolder.workspace.id),
        }),
        payload,
        user: collisionHolder.user,
      }),
    ).resolves.toEqual({
      code: 'APP_CONFLICT',
      message: 'This workspace is already connected to another mobile app.',
      ok: false,
      status: 409,
    })
  })

  it('persists an unverified fallback as pending for the durable safety sweep', async () => {
    const appKey = expectedQuickAppKey('oberoi', owner.workspace.id)
    const fallbackURL = 'https://pending-fallback.example/download'
    const result = await createQuickLink({
      data: parse({
        fallbackUrl: fallbackURL,
        nativeUrl: 'oberoi://pending-fallback',
        workspaceId: String(owner.workspace.id),
      }),
      payload,
      user: owner.user,
    })

    expect(result).toMatchObject({
      ok: true,
      value: {
        fallbackStatus: 'pending-verification',
        publicUrl: `https://go.linksetgo.test/${appKey}/pending-fallback`,
      },
    })
    const assessments = await payload.find({
      collection: 'fallback-url-safety-assessments',
      depth: 0,
      limit: 2,
      overrideAccess: true,
      pagination: false,
      where: {
        and: [
          { workspace: { equals: owner.workspace.id } },
          { canonicalUrl: { equals: fallbackURL } },
        ],
      },
    })
    expect(assessments.docs).toHaveLength(1)
    expect(assessments.docs[0]).toMatchObject({ status: 'pending' })
  })

  it('reports a fallback as ready when DNS ownership and its safety verdict are current', async () => {
    const appKey = expectedQuickAppKey('oberoi', owner.workspace.id)
    const fallbackURL = 'https://ready-fallback.example/download'
    const req = await createLocalReq({ user: owner.user }, payload)
    const origin = await payload.create({
      collection: 'fallback-origins',
      data: {
        hostname: 'ready-fallback.example',
        status: 'pending',
        verificationToken: 'generated-by-server',
        workspace: owner.workspace.id,
      },
      depth: 0,
      overrideAccess: false,
      req,
      user: owner.user,
    })
    const instructions = buildFallbackOriginInstructions(origin)
    if (!instructions) throw new Error('Fallback verification instructions were not created.')
    await beginFallbackOriginVerification({ id: origin.id, payload, req })
    await expect(
      verifyFallbackOriginWithProvider({
        id: origin.id,
        payload,
        provider: {
          lookupTXT: async () => ({
            observedAt: new Date().toISOString(),
            values: [instructions.value],
          }),
        },
        req,
      }),
    ).resolves.toMatchObject({ ok: true })
    await ensureFallbackURLSafetyAssessment({
      originId: origin.id,
      payload,
      url: fallbackURL,
      workspaceId: owner.workspace.id,
    })
    await runFallbackURLSafetyAssessment({
      originId: origin.id,
      payload,
      providerConfiguration: {
        available: true,
        maxAgeMs: 60 * 60 * 1_000,
        provider: {
          assessURL: async () => ({
            kind: 'safe',
            observedAt: new Date().toISOString(),
            redirectCount: 0,
          }),
        },
      },
      url: fallbackURL,
      workspaceId: owner.workspace.id,
    })

    await expect(
      createQuickLink({
        data: parse({
          fallbackUrl: fallbackURL,
          nativeUrl: 'oberoi://verified-fallback',
          workspaceId: String(owner.workspace.id),
        }),
        payload,
        user: owner.user,
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        fallbackStatus: 'ready',
        publicUrl: `https://go.linksetgo.test/${appKey}/verified-fallback`,
      },
    })
  })

  it('rejects a revoked fallback origin instead of silently returning pending', async () => {
    const fallbackURL = 'https://revoked-fallback.example/download'
    const req = await createLocalReq({ user: owner.user }, payload)
    const origin = await payload.create({
      collection: 'fallback-origins',
      data: {
        hostname: 'revoked-fallback.example',
        status: 'pending',
        verificationToken: 'generated-by-server',
        workspace: owner.workspace.id,
      },
      depth: 0,
      overrideAccess: false,
      req,
      user: owner.user,
    })
    await expect(revokeFallbackOrigin({ id: origin.id, payload, req })).resolves.toMatchObject({
      ok: true,
      origin: { status: 'revoked' },
    })

    await expect(
      createQuickLink({
        data: parse({
          fallbackUrl: fallbackURL,
          nativeUrl: 'oberoi://revoked-fallback',
          workspaceId: String(owner.workspace.id),
        }),
        payload,
        user: owner.user,
      }),
    ).resolves.toEqual({
      code: 'CONFLICT',
      message: 'This fallback hostname has been revoked and cannot be reused.',
      ok: false,
      status: 409,
    })
  })

  it('rejects an exact fallback URL with a current unsafe assessment', async () => {
    const fallbackURL = 'https://unsafe-fallback.example/download'
    const req = await createLocalReq({ user: owner.user }, payload)
    const origin = await payload.create({
      collection: 'fallback-origins',
      data: {
        hostname: 'unsafe-fallback.example',
        status: 'pending',
        verificationToken: 'generated-by-server',
        workspace: owner.workspace.id,
      },
      depth: 0,
      overrideAccess: false,
      req,
      user: owner.user,
    })
    await ensureFallbackURLSafetyAssessment({
      originId: origin.id,
      payload,
      url: fallbackURL,
      workspaceId: owner.workspace.id,
    })
    await runFallbackURLSafetyAssessment({
      originId: origin.id,
      payload,
      providerConfiguration: {
        available: true,
        maxAgeMs: 60 * 60 * 1_000,
        provider: {
          assessURL: async () => ({
            kind: 'unsafe',
            observedAt: new Date().toISOString(),
            redirectCount: 0,
            threats: ['malware'],
          }),
        },
      },
      url: fallbackURL,
      workspaceId: owner.workspace.id,
    })

    await expect(
      createQuickLink({
        data: parse({
          fallbackUrl: fallbackURL,
          nativeUrl: 'oberoi://unsafe-fallback',
          workspaceId: String(owner.workspace.id),
        }),
        payload,
        user: owner.user,
      }),
    ).resolves.toEqual({
      code: 'INVALID_INPUT',
      message: 'This exact fallback URL failed its safety check and cannot be selected.',
      ok: false,
      status: 422,
    })
  })

  it('rolls back a link that exceeds the Free active-link quota', async () => {
    const fallbackURL = 'https://quick-rollback.example/download'
    const result = await createQuickLink({
      data: parse({
        fallbackUrl: fallbackURL,
        nativeUrl: 'quotaapp://over-limit',
        workspaceId: String(quota.workspace.id),
      }),
      payload,
      user: quota.user,
    })

    expect(result).toEqual({
      code: 'PLAN_LIMIT',
      message:
        'Cloud Free has reached its activeLinks limit. Upgrade or remove an existing resource.',
      ok: false,
      status: 402,
    })
    const links = await payload.count({
      collection: 'deep-links',
      overrideAccess: true,
      where: { app: { equals: quotaApp.id } },
    })
    expect(links.totalDocs).toBe(planCatalog.free.limits.activeLinks)
    const appAfterRollback = await payload.findByID({
      collection: 'apps',
      id: quotaApp.id,
      depth: 0,
      overrideAccess: true,
    })
    expect(appAfterRollback.fallbackUrl).toBeFalsy()
    await expect(
      payload.count({
        collection: 'fallback-origins',
        overrideAccess: true,
        where: {
          and: [
            { workspace: { equals: quota.workspace.id } },
            { hostname: { equals: 'quick-rollback.example' } },
          ],
        },
      }),
    ).resolves.toMatchObject({ totalDocs: 0 })
    await expect(
      payload.count({
        collection: 'fallback-url-safety-assessments',
        overrideAccess: true,
        where: {
          and: [
            { workspace: { equals: quota.workspace.id } },
            { canonicalUrl: { equals: fallbackURL } },
          ],
        },
      }),
    ).resolves.toMatchObject({ totalDocs: 0 })
  })
})
