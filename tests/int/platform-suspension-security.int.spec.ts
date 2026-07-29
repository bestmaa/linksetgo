import config from '@/payload.config'
import { MEMBERSHIP_OWNER_OVERRIDE_CONTEXT } from '@/lib/server/membership-owner-guards'
import { setPlatformSuspension } from '@/lib/server/platform-suspension'
import type { User } from '@/payload-types'
import { createLocalReq, getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const FIXTURE = {
  app: 'suspension-security-app',
  organization: 'suspension-security-org',
  platformUser: 'suspension-platform@linksetgo.test',
  tenantUser: 'suspension-tenant@linksetgo.test',
  workspace: 'suspension-security-workspace',
} as const

describe.sequential('platform abuse holds', () => {
  let payload: Payload | undefined
  let platformUser: User
  let tenantUser: User
  let organizationID: number
  let workspaceID: number
  let appID: number
  let linkID: number

  const cleanup = async (): Promise<void> => {
    if (!payload) return
    const users = await payload.find({
      collection: 'users',
      depth: 0,
      limit: 5,
      overrideAccess: true,
      pagination: false,
      where: { email: { in: [FIXTURE.platformUser, FIXTURE.tenantUser] } },
    })
    const userIDs = users.docs.map((user) => user.id)
    if (userIDs.length > 0) {
      await payload.delete({
        collection: 'abuse-case-events',
        overrideAccess: true,
        where: { actor: { in: userIDs } },
      })
      await payload.delete({
        collection: 'enforcement-events',
        overrideAccess: true,
        where: { actor: { in: userIDs } },
      })
    }
    const organizations = await payload.find({
      collection: 'organizations',
      depth: 0,
      limit: 5,
      overrideAccess: true,
      pagination: false,
      where: { slug: { equals: FIXTURE.organization } },
    })
    const ids = organizations.docs.map((organization) => organization.id)
    if (ids.length > 0) {
      await payload.delete({
        collection: 'organization-memberships',
        context: { [MEMBERSHIP_OWNER_OVERRIDE_CONTEXT]: true },
        overrideAccess: true,
        where: { organization: { in: ids } },
      })
      const workspaces = await payload.find({
        collection: 'workspaces',
        depth: 0,
        limit: 5,
        overrideAccess: true,
        pagination: false,
        where: { organization: { in: ids } },
      })
      const workspaceIDs = workspaces.docs.map((workspace) => workspace.id)
      const apps = await payload.find({
        collection: 'apps',
        depth: 0,
        limit: 10,
        overrideAccess: true,
        pagination: false,
        where: { workspace: { in: workspaceIDs } },
      })
      await payload.delete({
        collection: 'deep-links',
        overrideAccess: true,
        where: { app: { in: apps.docs.map((app) => app.id) } },
      })
      await payload.delete({
        collection: 'apps',
        overrideAccess: true,
        where: { id: { in: apps.docs.map((app) => app.id) } },
      })
      await payload.delete({
        collection: 'workspaces',
        overrideAccess: true,
        where: { id: { in: workspaceIDs } },
      })
      await payload.delete({
        collection: 'organizations',
        overrideAccess: true,
        where: { id: { in: ids } },
      })
    }
    await payload.delete({
      collection: 'users',
      overrideAccess: true,
      where: { id: { in: userIDs } },
    })
  }

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    await cleanup()
    platformUser = await payload.create({
      collection: 'users',
      overrideAccess: true,
      data: {
        email: FIXTURE.platformUser,
        name: 'Suspension platform operator',
        password: 'SuspensionPlatformPassword123!',
        role: 'super-admin',
        status: 'active',
      },
    })
    tenantUser = await payload.create({
      collection: 'users',
      overrideAccess: true,
      data: {
        email: FIXTURE.tenantUser,
        name: 'Suspension tenant owner',
        password: 'SuspensionTenantPassword123!',
        role: 'admin',
        status: 'active',
      },
    })
    const organization = await payload.create({
      collection: 'organizations',
      overrideAccess: true,
      data: { name: 'Suspension Org', slug: FIXTURE.organization, status: 'active' },
    })
    organizationID = organization.id
    const workspace = await payload.create({
      collection: 'workspaces',
      overrideAccess: true,
      data: {
        name: 'Suspension workspace',
        organization: organization.id,
        slug: FIXTURE.workspace,
        status: 'active',
      },
    })
    workspaceID = workspace.id
    await payload.create({
      collection: 'organization-memberships',
      overrideAccess: true,
      data: {
        organization: organization.id,
        role: 'owner',
        status: 'active',
        user: tenantUser.id,
      },
    })
    const app = await payload.create({
      collection: 'apps',
      overrideAccess: true,
      data: {
        fallbackUrl: 'https://suspension.example/download',
        iosBundleId: 'com.relay.suspension',
        iosTeamId: 'A1B2C3D4E5',
        name: 'Suspension app',
        slug: FIXTURE.app,
        status: 'active',
        workspace: workspace.id,
      },
    })
    appID = app.id
    const link = await payload.create({
      collection: 'deep-links',
      overrideAccess: true,
      data: {
        app: app.id,
        destinationPath: '/offer',
        name: 'Suspension link',
        slug: 'offer',
        status: 'active',
      },
    })
    linkID = link.id
  })

  afterAll(async () => {
    if (!payload) return
    try {
      await cleanup()
    } finally {
      await payload.destroy()
    }
  })

  it('allows ordinary edits while rejecting forged enforcement writes', async () => {
    await expect(
      payload!.update({
        collection: 'deep-links',
        id: linkID,
        overrideAccess: true,
        user: tenantUser,
        data: { name: 'Ordinary tenant edit' },
      }),
    ).resolves.toMatchObject({ name: 'Ordinary tenant edit', platformSuspended: false })

    await expect(
      payload!.update({
        collection: 'deep-links',
        id: linkID,
        overrideAccess: true,
        user: tenantUser,
        data: { platformSuspended: true },
      }),
    ).rejects.toThrow(/platform enforcement service/i)
  })

  it('keeps a platform hold independent from tenant lifecycle status', async () => {
    const req = await createLocalReq({ user: platformUser }, payload!)
    await expect(
      setPlatformSuspension({
        action: 'suspend',
        reason: 'Confirmed abuse investigation',
        req,
        resourceID: workspaceID,
        resourceType: 'workspace',
      }),
    ).resolves.toMatchObject({ changed: true, suspended: true })

    await expect(
      payload!.update({
        collection: 'workspaces',
        id: workspaceID,
        overrideAccess: true,
        user: tenantUser,
        data: { platformSuspended: false, status: 'active' },
      }),
    ).rejects.toThrow(/platform enforcement service/i)

    const workspace = await payload!.findByID({
      collection: 'workspaces',
      id: workspaceID,
      depth: 0,
      overrideAccess: true,
    })
    expect(workspace).toMatchObject({ platformSuspended: true, status: 'active' })
  })

  it('protects app/link/organization holds and records immutable enforcement evidence', async () => {
    const req = await createLocalReq({ user: platformUser }, payload!)
    for (const [resourceType, resourceID] of [
      ['organization', organizationID],
      ['app', appID],
      ['link', linkID],
    ] as const) {
      await setPlatformSuspension({
        action: 'suspend',
        reason: `Evidence-backed ${resourceType} hold`,
        req,
        resourceID,
        resourceType,
      })
    }

    await expect(
      payload!.update({
        collection: 'apps',
        id: appID,
        overrideAccess: true,
        user: tenantUser,
        data: { platformSuspended: false },
      }),
    ).rejects.toThrow(/platform enforcement service/i)
    await expect(
      payload!.update({
        collection: 'deep-links',
        id: linkID,
        overrideAccess: true,
        user: tenantUser,
        data: { platformSuspended: false },
      }),
    ).rejects.toThrow(/platform enforcement service/i)
    await expect(
      payload!.update({
        collection: 'organizations',
        id: organizationID,
        overrideAccess: true,
        user: tenantUser,
        data: { platformSuspended: false, status: 'active' },
      }),
    ).rejects.toThrow(/platform enforcement service/i)

    const events = await payload!.find({
      collection: 'enforcement-events',
      depth: 0,
      limit: 20,
      overrideAccess: true,
      pagination: false,
      where: {
        and: [
          {
            resourceID: {
              in: [String(organizationID), String(workspaceID), String(appID), String(linkID)],
            },
          },
          { action: { equals: 'suspend' } },
        ],
      },
    })
    expect(events.totalDocs).toBeGreaterThanOrEqual(4)
  })
})
