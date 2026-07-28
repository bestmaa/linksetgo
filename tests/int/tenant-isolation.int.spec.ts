import type { App, Organization, User, Workspace } from '@/payload-types'
import config from '@/payload.config'
import { MEMBERSHIP_OWNER_OVERRIDE_CONTEXT } from '@/lib/server/membership-owner-guards'
import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const FIXTURE = {
  appA: 'tenant-alpha-app',
  appB: 'tenant-beta-app',
  createdAppA: 'tenant-alpha-created-app',
  linkA: 'tenant-alpha-link',
  linkB: 'tenant-beta-link',
  organizationA: 'tenant-alpha',
  organizationB: 'tenant-beta',
  userA: 'tenant-alpha@relay.test',
  userB: 'tenant-beta@relay.test',
  platformUser: 'tenant-platform@relay.test',
  workspaceA: 'tenant-alpha-workspace',
  workspaceB: 'tenant-beta-workspace',
} as const

const assertTestDatabase = (): void => {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is required for integration tests.')

  const databaseName = decodeURIComponent(new URL(connectionString).pathname.slice(1))
  if (!databaseName.endsWith('_test')) {
    throw new Error(`Refusing to run integration cleanup against "${databaseName}".`)
  }
}

describe.sequential('organization tenant isolation', () => {
  let payload: Payload | undefined
  let organizationA: Organization
  let organizationB: Organization
  let workspaceA: Workspace
  let workspaceB: Workspace
  let userA: User
  let userB: User
  let appA: App
  let appB: App

  const cleanup = async (): Promise<void> => {
    if (!payload) return

    await payload.delete({
      collection: 'deep-links',
      overrideAccess: true,
      where: { slug: { in: [FIXTURE.linkA, FIXTURE.linkB] } },
    })
    await payload.delete({
      collection: 'apps',
      overrideAccess: true,
      where: { slug: { in: [FIXTURE.appA, FIXTURE.appB, FIXTURE.createdAppA] } },
    })

    const organizations = await payload.find({
      collection: 'organizations',
      depth: 0,
      limit: 10,
      overrideAccess: true,
      pagination: false,
      where: { slug: { in: [FIXTURE.organizationA, FIXTURE.organizationB] } },
    })
    const organizationIDs = organizations.docs.map((organization) => organization.id)
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
      where: { email: { in: [FIXTURE.platformUser, FIXTURE.userA, FIXTURE.userB] } },
    })
  }

  beforeAll(async () => {
    assertTestDatabase()
    payload = await getPayload({ config: await config })
    await cleanup()

    await payload.create({
      collection: 'users',
      overrideAccess: true,
      data: {
        email: FIXTURE.platformUser,
        name: 'Tenant test platform admin',
        password: 'TenantPlatformPassword123!',
        role: 'super-admin',
        status: 'active',
      },
    })
    userA = await payload.create({
      collection: 'users',
      overrideAccess: true,
      data: {
        email: FIXTURE.userA,
        name: 'Tenant Alpha owner',
        password: 'TenantAlphaPassword123!',
        role: 'admin',
        status: 'active',
      },
    })
    userB = await payload.create({
      collection: 'users',
      overrideAccess: true,
      data: {
        email: FIXTURE.userB,
        name: 'Tenant Beta owner',
        password: 'TenantBetaPassword123!',
        role: 'admin',
        status: 'active',
      },
    })

    organizationA = await payload.create({
      collection: 'organizations',
      overrideAccess: true,
      data: { name: 'Tenant Alpha', slug: FIXTURE.organizationA, status: 'active' },
    })
    organizationB = await payload.create({
      collection: 'organizations',
      overrideAccess: true,
      data: { name: 'Tenant Beta', slug: FIXTURE.organizationB, status: 'active' },
    })
    workspaceA = await payload.create({
      collection: 'workspaces',
      overrideAccess: true,
      data: {
        name: 'Tenant Alpha workspace',
        organization: organizationA.id,
        slug: FIXTURE.workspaceA,
        status: 'active',
      },
    })
    workspaceB = await payload.create({
      collection: 'workspaces',
      overrideAccess: true,
      data: {
        name: 'Tenant Beta workspace',
        organization: organizationB.id,
        slug: FIXTURE.workspaceB,
        status: 'active',
      },
    })

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

    appA = await payload.create({
      collection: 'apps',
      overrideAccess: true,
      data: {
        fallbackUrl: 'https://alpha.relay.test',
        iosBundleId: 'com.example.tenantalpha',
        iosTeamId: 'ALPHA12345',
        name: 'Tenant Alpha app',
        nativeScheme: 'tenantalpha',
        slug: FIXTURE.appA,
        status: 'active',
        workspace: workspaceA.id,
      },
    })
    appB = await payload.create({
      collection: 'apps',
      overrideAccess: true,
      data: {
        fallbackUrl: 'https://beta.relay.test',
        iosBundleId: 'com.example.tenantbeta',
        iosTeamId: 'BETA123456',
        name: 'Tenant Beta app',
        nativeScheme: 'tenantbeta',
        slug: FIXTURE.appB,
        status: 'active',
        workspace: workspaceB.id,
      },
    })

    await Promise.all([
      payload.create({
        collection: 'deep-links',
        overrideAccess: true,
        data: {
          app: appA.id,
          destinationPath: '/alpha',
          name: 'Tenant Alpha link',
          slug: FIXTURE.linkA,
          status: 'active',
        },
      }),
      payload.create({
        collection: 'deep-links',
        overrideAccess: true,
        data: {
          app: appB.id,
          destinationPath: '/beta',
          name: 'Tenant Beta link',
          slug: FIXTURE.linkB,
          status: 'active',
        },
      }),
    ])
  })

  afterAll(async () => {
    if (!payload) return
    try {
      await cleanup()
    } finally {
      await payload.destroy()
    }
  })

  it('returns only apps, links, and workspaces owned by the signed-in tenant', async () => {
    const [appsForA, linksForA, workspacesForA, appsForB, linksForB] = await Promise.all([
      payload!.find({ collection: 'apps', overrideAccess: false, user: userA }),
      payload!.find({ collection: 'deep-links', overrideAccess: false, user: userA }),
      payload!.find({ collection: 'workspaces', overrideAccess: false, user: userA }),
      payload!.find({ collection: 'apps', overrideAccess: false, user: userB }),
      payload!.find({ collection: 'deep-links', overrideAccess: false, user: userB }),
    ])

    expect(appsForA.docs.map((app) => app.slug)).toContain(FIXTURE.appA)
    expect(appsForA.docs.map((app) => app.slug)).not.toContain(FIXTURE.appB)
    expect(linksForA.docs.map((link) => link.slug)).toContain(FIXTURE.linkA)
    expect(linksForA.docs.map((link) => link.slug)).not.toContain(FIXTURE.linkB)
    expect(workspacesForA.docs.map((workspace) => workspace.slug)).toEqual([FIXTURE.workspaceA])
    expect(appsForB.docs.map((app) => app.slug)).toContain(FIXTURE.appB)
    expect(appsForB.docs.map((app) => app.slug)).not.toContain(FIXTURE.appA)
    expect(linksForB.docs.map((link) => link.slug)).toContain(FIXTURE.linkB)
    expect(linksForB.docs.map((link) => link.slug)).not.toContain(FIXTURE.linkA)
  })

  it('blocks cross-tenant app assignment and deep-link creation on the server', async () => {
    await expect(
      payload!.create({
        collection: 'apps',
        overrideAccess: false,
        user: userA,
        data: {
          fallbackUrl: 'https://blocked.relay.test',
          name: 'Blocked cross-tenant app',
          nativeScheme: 'blockedtenant',
          slug: 'blocked-cross-tenant-app',
          status: 'active',
          workspace: workspaceB.id,
        },
      }),
    ).rejects.toMatchObject({ status: 403 })

    await expect(
      payload!.create({
        collection: 'deep-links',
        overrideAccess: false,
        user: userA,
        data: {
          app: appB.id,
          destinationPath: '/blocked',
          name: 'Blocked cross-tenant link',
          slug: 'blocked-cross-tenant-link',
          status: 'active',
        },
      }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('auto-assigns the only manageable workspace for backward-compatible app creation', async () => {
    const created = await payload!.create({
      collection: 'apps',
      depth: 0,
      overrideAccess: false,
      user: userA,
      data: {
        fallbackUrl: 'https://alpha.relay.test/created',
        iosBundleId: 'com.example.tenantcreated',
        iosTeamId: 'CREATE1234',
        name: 'Tenant Alpha created app',
        nativeScheme: 'tenantcreated',
        slug: FIXTURE.createdAppA,
        status: 'active',
      },
    })

    expect(String(created.workspace)).toBe(String(workspaceA.id))
  })
})
