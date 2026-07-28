import config from '@/payload.config'
import type { Organization, OrganizationMembership, User } from '@/payload-types'
import { MEMBERSHIP_OWNER_OVERRIDE_CONTEXT } from '@/lib/server/membership-owner-guards'
import { mutateTeamMember } from '@/lib/server/team-console'
import type { TeamInvitationDelivery } from '@/lib/server/team-invitation-delivery'
import { TEAM_INVITATION_WRITE_CONTEXT } from '@/lib/server/team-invitation-guards'
import {
  acceptOrganizationInvitation,
  createOrganizationInvitation,
  hashTeamInvitationToken,
  previewOrganizationInvitation,
  revokeOrganizationInvitation,
} from '@/lib/server/team-invitation-service'
import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const FIXTURE = {
  emails: [
    'team-platform@relay.test',
    'team-owner@relay.test',
    'team-admin@relay.test',
    'team-other-owner@relay.test',
    'team-invitee@relay.test',
    'team-rollback@relay.test',
    'team-expired@relay.test',
    'team-revoked@relay.test',
  ],
  organizations: ['team-invitations-primary', 'team-invitations-other'],
} as const

const originalEdition = process.env.RELAY_EDITION

const assertTestDatabase = (): void => {
  const value = process.env.DATABASE_URL
  if (!value || !decodeURIComponent(new URL(value).pathname).endsWith('_test')) {
    throw new Error('Team invitation tests require the disposable _test database.')
  }
}

describe.sequential('secure organization invitations and owner safety', () => {
  let payload: Payload
  let platform: User
  let owner: User
  let otherOwner: User
  let organization: Organization
  let otherOrganization: Organization
  let ownerMembership: OrganizationMembership
  let delivered: TeamInvitationDelivery | null = null

  const cleanup = async (): Promise<void> => {
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
        collection: 'organization-invitations',
        context: { [TEAM_INVITATION_WRITE_CONTEXT]: true },
        overrideAccess: true,
        where: { organization: { in: organizationIDs } },
      })
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
        collection: 'organizations',
        overrideAccess: true,
        where: { id: { in: organizationIDs } },
      })
    }
    await payload.delete({
      collection: 'users',
      overrideAccess: true,
      where: { email: { in: [...FIXTURE.emails] } },
    })
  }

  const createUser = (input: {
    email: string
    name: string
    role?: 'admin' | 'super-admin' | 'viewer'
  }) =>
    payload.create({
      collection: 'users',
      data: {
        email: input.email,
        name: input.name,
        password: 'TeamInvitationPassword123!',
        role: input.role ?? 'viewer',
        status: 'active',
      },
      overrideAccess: true,
    })

  beforeAll(async () => {
    assertTestDatabase()
    process.env.RELAY_EDITION = 'community'
    payload = await getPayload({ config: await config })
    await cleanup()

    platform = await createUser({
      email: FIXTURE.emails[0],
      name: 'Team platform admin',
      role: 'super-admin',
    })
    owner = await createUser({ email: FIXTURE.emails[1], name: 'Team owner' })
    otherOwner = await createUser({
      email: FIXTURE.emails[3],
      name: 'Other owner',
    })
    ;[organization, otherOrganization] = await Promise.all([
      payload.create({
        collection: 'organizations',
        data: {
          name: 'Invitation Primary',
          slug: FIXTURE.organizations[0],
          status: 'active',
        },
        overrideAccess: true,
      }),
      payload.create({
        collection: 'organizations',
        data: {
          name: 'Invitation Other',
          slug: FIXTURE.organizations[1],
          status: 'active',
        },
        overrideAccess: true,
      }),
    ])
    ownerMembership = await payload.create({
      collection: 'organization-memberships',
      data: {
        organization: organization.id,
        role: 'owner',
        status: 'active',
        user: owner.id,
      },
      overrideAccess: true,
    })
    await payload.create({
      collection: 'organization-memberships',
      data: {
        organization: otherOrganization.id,
        role: 'owner',
        status: 'active',
        user: otherOwner.id,
      },
      overrideAccess: true,
    })
    await payload.create({
      collection: 'subscriptions',
      data: {
        catalogVersion: 1,
        lastEventAt: '2026-07-27T00:00:00.000Z',
        lastProviderEventID: 'team-plan-initialized',
        organization: organization.id,
        plan: 'pro',
        provider: 'team-test',
        providerSubscriptionID: 'team-pro-primary',
        status: 'active',
      },
      overrideAccess: true,
    })
    process.env.RELAY_EDITION = 'cloud'
  }, 60_000)

  afterAll(async () => {
    if (!payload) return
    try {
      process.env.RELAY_EDITION = 'community'
      await cleanup()
    } finally {
      if (originalEdition === undefined) delete process.env.RELAY_EDITION
      else process.env.RELAY_EDITION = originalEdition
      await payload.destroy()
    }
  }, 60_000)

  it('stores only a token hash and exposes a safe invitation projection', async () => {
    const token = 'A'.repeat(43)
    const result = await createOrganizationInvitation(
      {
        delivery: 'webhook',
        email: FIXTURE.emails[4],
        organizationId: String(organization.id),
        role: 'member',
      },
      {
        appBaseURL: 'https://app.relay.test',
        now: () => new Date('2026-07-27T08:00:00.000Z'),
        payload,
        randomToken: () => token,
        sendInvitation: async (value) => {
          delivered = value
        },
        user: owner,
      },
    )

    expect(result).not.toHaveProperty('manualUrl')
    expect(result.invitation).not.toHaveProperty('tokenHash')
    expect(delivered?.invitationURL).toBe(`https://app.relay.test/invite#token=${token}`)
    const stored = await payload.find({
      collection: 'organization-invitations',
      overrideAccess: true,
      showHiddenFields: true,
      where: { emailNormalized: { equals: FIXTURE.emails[4] } },
    })
    expect(stored.docs).toHaveLength(1)
    expect(stored.docs[0]?.tokenHash).toBe(hashTeamInvitationToken(token))
    expect(JSON.stringify(stored.docs[0])).not.toContain(token)
  })

  it('keeps invitation records private and rejects forged direct writes', async () => {
    await expect(
      payload.find({
        collection: 'organization-invitations',
        overrideAccess: false,
        user: owner,
      }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      payload.create({
        collection: 'organization-invitations',
        data: {
          deliveryMode: 'webhook',
          emailNormalized: 'team-forged@relay.test',
          expiresAt: '2026-08-03T00:00:00.000Z',
          invitedBy: owner.id,
          organization: organization.id,
          role: 'owner',
          status: 'pending',
          tokenHash: hashTeamInvitationToken('Z'.repeat(43)),
        },
        overrideAccess: true,
      }),
    ).rejects.toThrow(/only through the invitation service/i)
  })

  it('fails closed and rolls back when delivery cannot be queued', async () => {
    await expect(
      createOrganizationInvitation(
        {
          delivery: 'webhook',
          email: FIXTURE.emails[5],
          organizationId: String(organization.id),
          role: 'viewer',
        },
        {
          appBaseURL: 'https://app.relay.test',
          payload,
          randomToken: () => 'B'.repeat(43),
          sendInvitation: async () => {
            throw new Error('Simulated provider outage')
          },
          user: owner,
        },
      ),
    ).rejects.toMatchObject({ code: 'DELIVERY_FAILED' })
    await expect(
      payload.count({
        collection: 'organization-invitations',
        overrideAccess: true,
        where: { emailNormalized: { equals: FIXTURE.emails[5] } },
      }),
    ).resolves.toMatchObject({ totalDocs: 0 })
  })

  it('creates only the matching Cloud user and accepts the link exactly once', async () => {
    const token = 'A'.repeat(43)
    await expect(
      previewOrganizationInvitation({
        authenticatedUser: null,
        now: () => new Date('2026-07-27T08:05:00.000Z'),
        payload,
        token,
      }),
    ).resolves.toMatchObject({
      accountMode: 'create',
      emailMasked: expect.stringMatching(/@relay\.test$/),
      organizationName: organization.name,
      role: 'member',
    })
    const organizationsBefore = await payload.count({
      collection: 'organizations',
      overrideAccess: true,
    })
    await expect(
      acceptOrganizationInvitation(
        {
          name: 'Invited Member',
          password: 'InvitedMemberPassword123!',
          token,
        },
        {
          authenticatedUser: null,
          now: () => new Date('2026-07-27T08:06:00.000Z'),
          payload,
        },
      ),
    ).resolves.toEqual({
      organizationName: organization.name,
      signInRequired: true,
      status: 'accepted',
    })
    const invitedUsers = await payload.find({
      collection: 'users',
      overrideAccess: true,
      where: { email: { equals: FIXTURE.emails[4] } },
    })
    expect(invitedUsers.docs).toHaveLength(1)
    expect(invitedUsers.docs[0]).toMatchObject({ role: 'viewer', status: 'active' })
    const memberships = await payload.find({
      collection: 'organization-memberships',
      overrideAccess: true,
      where: {
        and: [
          { organization: { equals: organization.id } },
          { user: { equals: invitedUsers.docs[0]!.id } },
        ],
      },
    })
    expect(memberships.docs).toHaveLength(1)
    expect(memberships.docs[0]).toMatchObject({ role: 'member', status: 'active' })
    await expect(
      payload.count({ collection: 'organizations', overrideAccess: true }),
    ).resolves.toMatchObject({ totalDocs: organizationsBefore.totalDocs })
    await expect(
      acceptOrganizationInvitation(
        { name: null, password: null, token },
        { authenticatedUser: invitedUsers.docs[0]!, payload },
      ),
    ).rejects.toMatchObject({ code: 'INVITATION_INVALID' })
  })

  it('rejects expired links and tenant-crossing management attempts', async () => {
    const token = 'C'.repeat(43)
    await createOrganizationInvitation(
      {
        delivery: 'webhook',
        email: FIXTURE.emails[6],
        organizationId: String(organization.id),
        role: 'viewer',
      },
      {
        appBaseURL: 'https://app.relay.test',
        now: () => new Date('2026-07-01T00:00:00.000Z'),
        payload,
        randomToken: () => token,
        sendInvitation: async () => undefined,
        user: owner,
      },
    )
    await expect(
      previewOrganizationInvitation({
        authenticatedUser: null,
        now: () => new Date('2026-07-09T00:00:00.000Z'),
        payload,
        token,
      }),
    ).rejects.toMatchObject({ code: 'INVITATION_INVALID' })
    await expect(
      createOrganizationInvitation(
        {
          delivery: 'webhook',
          email: FIXTURE.emails[7],
          organizationId: String(organization.id),
          role: 'member',
        },
        {
          appBaseURL: 'https://app.relay.test',
          payload,
          randomToken: () => 'D'.repeat(43),
          sendInvitation: async () => undefined,
          user: otherOwner,
        },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('allows scoped revocation but blocks replay and cross-tenant revocation', async () => {
    const created = await createOrganizationInvitation(
      {
        delivery: 'webhook',
        email: FIXTURE.emails[7],
        organizationId: String(organization.id),
        role: 'viewer',
      },
      {
        appBaseURL: 'https://app.relay.test',
        payload,
        randomToken: () => 'E'.repeat(43),
        sendInvitation: async () => undefined,
        user: owner,
      },
    )
    await expect(
      revokeOrganizationInvitation({
        invitationID: String(created.invitation.id),
        organizationID: String(otherOrganization.id),
        payload,
        user: otherOwner,
      }),
    ).rejects.toMatchObject({ code: 'INVITATION_INVALID' })
    await expect(
      revokeOrganizationInvitation({
        invitationID: String(created.invitation.id),
        organizationID: String(organization.id),
        payload,
        user: owner,
      }),
    ).resolves.toBeUndefined()
    await expect(
      previewOrganizationInvitation({
        authenticatedUser: null,
        payload,
        token: 'E'.repeat(43),
      }),
    ).rejects.toMatchObject({ code: 'INVITATION_INVALID' })
  })

  it('reserves the Cloud member quota before issuing an invitation', async () => {
    await expect(
      createOrganizationInvitation(
        {
          delivery: 'webhook',
          email: FIXTURE.emails[2],
          organizationId: String(otherOrganization.id),
          role: 'member',
        },
        {
          appBaseURL: 'https://app.relay.test',
          payload,
          randomToken: () => 'F'.repeat(43),
          sendInvitation: async () => undefined,
          user: otherOwner,
        },
      ),
    ).rejects.toMatchObject({ code: 'PLAN_LIMIT', status: 402 })
    await expect(
      payload.count({
        collection: 'organization-invitations',
        overrideAccess: true,
        where: { emailNormalized: { equals: FIXTURE.emails[2] } },
      }),
    ).resolves.toMatchObject({ totalDocs: 0 })
  })

  it('prevents self-lockout and removal of the last active owner', async () => {
    await expect(
      mutateTeamMember({
        membershipID: String(ownerMembership.id),
        mutation: {
          action: 'update',
          organizationId: String(organization.id),
          role: 'member',
          status: 'active',
        },
        payload,
        user: owner,
      }),
    ).resolves.toMatchObject({ code: 'INVALID_CHANGE', ok: false, status: 409 })
    await expect(
      mutateTeamMember({
        membershipID: String(ownerMembership.id),
        mutation: {
          action: 'update',
          organizationId: String(organization.id),
          role: 'owner',
          status: 'disabled',
        },
        payload,
        user: platform,
      }),
    ).resolves.toMatchObject({ code: 'INVALID_CHANGE', ok: false, status: 409 })
  })
})
