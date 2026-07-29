import config from '@/payload.config'
import {
  createCloudSignup,
  verifyCloudSignupEmail,
  type VerificationDelivery,
} from '@/lib/server/cloud-signup-service'
import { MEMBERSHIP_OWNER_OVERRIDE_CONTEXT } from '@/lib/server/membership-owner-guards'
import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const FIXTURE = {
  platformEmail: 'cloud-signup-platform@linksetgo.test',
  rollbackEmail: 'cloud-signup-rollback@linksetgo.test',
  rollbackSlug: 'cloud-signup-rollback',
  successEmail: 'cloud-signup-success@linksetgo.test',
  successSlug: 'cloud-signup-success',
} as const
const originalLinksetGoEdition = process.env.RELAY_EDITION
const originalSignupEnabled = process.env.CLOUD_SIGNUP_ENABLED

const assertTestDatabase = (): void => {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is required for integration tests.')

  const databaseName = decodeURIComponent(new URL(connectionString).pathname.slice(1))
  if (!databaseName.endsWith('_test')) {
    throw new Error(`Refusing to run integration cleanup against "${databaseName}".`)
  }
}

describe.sequential('atomic Relay Cloud signup', () => {
  let payload: Payload | undefined
  let delivered: VerificationDelivery | undefined

  const cleanup = async (): Promise<void> => {
    if (!payload) return

    await payload.delete({
      collection: 'domains',
      overrideAccess: true,
      where: {
        hostname: {
          in: [
            `${FIXTURE.rollbackSlug}.links.linksetgo.test`,
            `${FIXTURE.successSlug}.links.linksetgo.test`,
          ],
        },
      },
    })
    const organizations = await payload.find({
      collection: 'organizations',
      depth: 0,
      limit: 10,
      overrideAccess: true,
      pagination: false,
      where: { slug: { in: [FIXTURE.rollbackSlug, FIXTURE.successSlug] } },
    })
    const organizationIDs = organizations.docs.map((organization) => organization.id)
    if (organizationIDs.length > 0) {
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
      where: {
        email: {
          in: [FIXTURE.platformEmail, FIXTURE.rollbackEmail, FIXTURE.successEmail],
        },
      },
    })
  }

  beforeAll(async () => {
    assertTestDatabase()
    process.env.RELAY_EDITION = 'cloud'
    process.env.CLOUD_SIGNUP_ENABLED = 'true'
    payload = await getPayload({ config: await config })
    await cleanup()
    await payload.create({
      collection: 'users',
      data: {
        email: FIXTURE.platformEmail,
        name: 'Cloud signup platform owner',
        password: 'CloudPlatformPassword123!',
        role: 'super-admin',
        status: 'active',
      },
      overrideAccess: true,
    })
  })

  afterAll(async () => {
    if (!payload) {
      if (originalLinksetGoEdition === undefined) delete process.env.RELAY_EDITION
      else process.env.RELAY_EDITION = originalLinksetGoEdition
      if (originalSignupEnabled === undefined) delete process.env.CLOUD_SIGNUP_ENABLED
      else process.env.CLOUD_SIGNUP_ENABLED = originalSignupEnabled
      return
    }
    try {
      await cleanup()
    } finally {
      await payload.destroy()
      if (originalLinksetGoEdition === undefined) delete process.env.RELAY_EDITION
      else process.env.RELAY_EDITION = originalLinksetGoEdition
      if (originalSignupEnabled === undefined) delete process.env.CLOUD_SIGNUP_ENABLED
      else process.env.CLOUD_SIGNUP_ENABLED = originalSignupEnabled
    }
  })

  it('rolls back every tenant record when verification delivery fails', async () => {
    await expect(
      createCloudSignup(
        {
          acceptTerms: true,
          email: FIXTURE.rollbackEmail,
          name: 'Rollback Owner',
          organizationName: 'Rollback Organization',
          password: 'RollbackPassword123!',
          workspaceSlug: FIXTURE.rollbackSlug,
        },
        {
          appBaseURL: 'https://app.linksetgo.test',
          managedLinkRootDomain: 'links.linksetgo.test',
          payload: payload!,
          randomToken: () => 'A'.repeat(43),
          sendVerification: async () => {
            throw new Error('Simulated delivery outage')
          },
        },
      ),
    ).rejects.toMatchObject({
      code: 'VERIFICATION_DELIVERY_FAILED',
    })

    const [users, organizations, workspaces, domains] = await Promise.all([
      payload!.find({
        collection: 'users',
        overrideAccess: true,
        where: { email: { equals: FIXTURE.rollbackEmail } },
      }),
      payload!.find({
        collection: 'organizations',
        overrideAccess: true,
        where: { slug: { equals: FIXTURE.rollbackSlug } },
      }),
      payload!.find({
        collection: 'workspaces',
        overrideAccess: true,
        where: { slug: { equals: FIXTURE.rollbackSlug } },
      }),
      payload!.find({
        collection: 'domains',
        overrideAccess: true,
        where: { hostname: { equals: `${FIXTURE.rollbackSlug}.links.linksetgo.test` } },
      }),
    ])
    expect([users, organizations, workspaces, domains].map((result) => result.totalDocs)).toEqual([
      0, 0, 0, 0,
    ])
  })

  it('creates an isolated pending graph and activates it only after one-time verification', async () => {
    const result = await createCloudSignup(
      {
        acceptTerms: true,
        email: FIXTURE.successEmail,
        name: 'Success Owner',
        organizationName: 'Success Organization',
        password: 'SuccessPassword123!',
        workspaceSlug: FIXTURE.successSlug,
      },
      {
        appBaseURL: 'https://app.linksetgo.test',
        managedLinkRootDomain: 'links.linksetgo.test',
        now: () => new Date('2026-07-27T06:00:00.000Z'),
        payload: payload!,
        randomToken: () => 'B'.repeat(43),
        sendVerification: async (delivery) => {
          delivered = delivery
        },
      },
    )

    expect(result).toMatchObject({
      email: FIXTURE.successEmail,
      managedHostname: `${FIXTURE.successSlug}.links.linksetgo.test`,
    })
    expect(delivered?.verificationURL).toBe(
      `https://app.linksetgo.test/verify-email#token=${'B'.repeat(43)}`,
    )

    const [user, organization, workspace, memberships, domains] = await Promise.all([
      payload!.findByID({
        collection: 'users',
        id: Number(result.userID),
        overrideAccess: true,
        showHiddenFields: true,
      }),
      payload!.findByID({
        collection: 'organizations',
        id: Number(result.organizationID),
        overrideAccess: true,
      }),
      payload!.findByID({
        collection: 'workspaces',
        id: Number(result.workspaceID),
        overrideAccess: true,
      }),
      payload!.find({
        collection: 'organization-memberships',
        overrideAccess: true,
        where: { user: { equals: Number(result.userID) } },
      }),
      payload!.find({
        collection: 'domains',
        overrideAccess: true,
        where: { workspace: { equals: Number(result.workspaceID) } },
      }),
    ])
    expect(user).toMatchObject({
      role: 'viewer',
      status: 'pending-verification',
      emailVerificationTokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
    expect(organization.status).toBe('pending-verification')
    expect(workspace.status).toBe('pending-verification')
    expect(memberships.docs).toHaveLength(1)
    expect(memberships.docs[0]).toMatchObject({ role: 'owner', status: 'disabled' })
    expect(domains.docs).toHaveLength(1)
    expect(domains.docs[0]).toMatchObject({ status: 'active', type: 'managed' })

    await expect(
      payload!.login({
        collection: 'users',
        data: { email: FIXTURE.successEmail, password: 'SuccessPassword123!' },
      }),
    ).rejects.toMatchObject({ status: 401 })

    await expect(
      verifyCloudSignupEmail('B'.repeat(43), payload!, new Date('2026-07-27T06:05:00.000Z')),
    ).resolves.toEqual({
      email: FIXTURE.successEmail,
      workspaceSlug: FIXTURE.successSlug,
    })

    const [activeUser, activeOrganization, activeWorkspace, activeMembership, subscriptions] =
      await Promise.all([
        payload!.findByID({
          collection: 'users',
          id: Number(result.userID),
          overrideAccess: true,
          showHiddenFields: true,
        }),
        payload!.findByID({
          collection: 'organizations',
          id: Number(result.organizationID),
          overrideAccess: true,
        }),
        payload!.findByID({
          collection: 'workspaces',
          id: Number(result.workspaceID),
          overrideAccess: true,
        }),
        payload!.find({
          collection: 'organization-memberships',
          overrideAccess: true,
          where: { user: { equals: Number(result.userID) } },
        }),
        payload!.find({
          collection: 'subscriptions',
          overrideAccess: true,
          where: { organization: { equals: Number(result.organizationID) } },
        }),
      ])
    expect(activeUser).toMatchObject({
      emailVerificationExpiresAt: null,
      emailVerificationTokenHash: null,
      status: 'active',
    })
    expect(activeOrganization.status).toBe('active')
    expect(activeWorkspace.status).toBe('active')
    expect(activeMembership.docs[0]?.status).toBe('active')
    expect(subscriptions.docs).toHaveLength(1)
    expect(subscriptions.docs[0]).toMatchObject({
      plan: 'free',
      provider: 'relay-internal',
      status: 'active',
    })

    await expect(
      verifyCloudSignupEmail('B'.repeat(43), payload!, new Date('2026-07-27T06:06:00.000Z')),
    ).rejects.toMatchObject({ code: 'VERIFICATION_INVALID' })
  })
})
