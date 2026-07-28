import config from '@/payload.config'
import {
  CLOUD_PENDING_SIGNUP_MAX_LIFETIME_MS,
  CLOUD_PENDING_SIGNUP_RECLAIM_GRACE_MS,
} from '@/lib/domain/cloud-signup'
import {
  createCloudSignup,
  pruneExpiredPendingCloudSignups,
  resendCloudSignupVerification,
  verifyCloudSignupEmail,
  type CloudSignupResult,
  type VerificationDelivery,
} from '@/lib/server/cloud-signup-service'
import { MEMBERSHIP_OWNER_OVERRIDE_CONTEXT } from '@/lib/server/membership-owner-guards'
import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const FIXTURE = {
  extraEmail: 'signup-lifecycle-extra@relay.test',
  platformEmail: 'signup-lifecycle-platform@relay.test',
  pruneSafeEmail: 'signup-lifecycle-prune-safe@relay.test',
  pruneSafeSlug: 'signup-lifecycle-prune-safe',
  pruneUnsafeEmail: 'signup-lifecycle-prune-unsafe@relay.test',
  pruneUnsafeSlug: 'signup-lifecycle-prune-unsafe',
  resendEmail: 'signup-lifecycle-resend@relay.test',
  resendSlug: 'signup-lifecycle-resend',
} as const
const allEmails = [
  FIXTURE.extraEmail,
  FIXTURE.platformEmail,
  FIXTURE.pruneSafeEmail,
  FIXTURE.pruneUnsafeEmail,
  FIXTURE.resendEmail,
]
const allSlugs = [FIXTURE.pruneSafeSlug, FIXTURE.pruneUnsafeSlug, FIXTURE.resendSlug]
const originalRelayEdition = process.env.RELAY_EDITION
const originalSignupEnabled = process.env.CLOUD_SIGNUP_ENABLED

const assertTestDatabase = (): void => {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is required for integration tests.')
  const databaseName = decodeURIComponent(new URL(connectionString).pathname.slice(1))
  if (!databaseName.endsWith('_test')) {
    throw new Error(`Refusing to run integration cleanup against "${databaseName}".`)
  }
}

describe.sequential('pending Relay Cloud signup lifecycle', () => {
  let payload: Payload | undefined

  const cleanup = async (): Promise<void> => {
    if (!payload) return
    const organizations = await payload.find({
      collection: 'organizations',
      depth: 0,
      limit: 20,
      overrideAccess: true,
      pagination: false,
      where: { slug: { in: allSlugs } },
    })
    const organizationIDs = organizations.docs.map(({ id }) => id)
    if (organizationIDs.length) {
      await payload.delete({
        collection: 'subscriptions',
        overrideAccess: true,
        where: { organization: { in: organizationIDs } },
      })
      await payload.delete({
        collection: 'domains',
        overrideAccess: true,
        where: { hostname: { in: allSlugs.map((slug) => `${slug}.links.relay.test`) } },
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
      where: { email: { in: allEmails } },
    })
  }

  const signup = async (
    email: string,
    slug: string,
    token: string,
    now: Date,
  ): Promise<CloudSignupResult> =>
    createCloudSignup(
      {
        acceptTerms: true,
        email,
        name: 'Lifecycle Owner',
        organizationName: `Lifecycle ${slug}`,
        password: 'LifecyclePassword123!',
        workspaceSlug: slug,
      },
      {
        appBaseURL: 'https://app.relay.test',
        managedLinkRootDomain: 'links.relay.test',
        now: () => now,
        payload: payload!,
        randomToken: () => token,
        sendVerification: async () => undefined,
      },
    )

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
        name: 'Signup Lifecycle Platform Owner',
        password: 'LifecyclePlatform123!',
        role: 'super-admin',
        status: 'active',
      },
      overrideAccess: true,
    })
  })

  afterAll(async () => {
    try {
      await cleanup()
    } finally {
      await payload?.destroy()
      if (originalRelayEdition === undefined) delete process.env.RELAY_EDITION
      else process.env.RELAY_EDITION = originalRelayEdition
      if (originalSignupEnabled === undefined) delete process.env.CLOUD_SIGNUP_ENABLED
      else process.env.CLOUD_SIGNUP_ENABLED = originalSignupEnabled
    }
  })

  it('rotates resend tokens but never extends the reservation past its original lifetime', async () => {
    const originalToken = 'R'.repeat(43)
    const replacementToken = 'S'.repeat(43)
    const result = await signup(FIXTURE.resendEmail, FIXTURE.resendSlug, originalToken, new Date())
    const user = await payload!.findByID({
      collection: 'users',
      id: Number(result.userID),
      overrideAccess: true,
      showHiddenFields: true,
    })
    const hardDeadline = new Date(Date.parse(user.createdAt) + CLOUD_PENDING_SIGNUP_MAX_LIFETIME_MS)
    const resendAt = new Date(hardDeadline.getTime() - 30 * 60 * 1_000)
    let delivery: VerificationDelivery | undefined

    await expect(
      resendCloudSignupVerification(FIXTURE.resendEmail, {
        appBaseURL: 'https://app.relay.test',
        now: () => resendAt,
        payload: payload!,
        randomToken: () => replacementToken,
        sendVerification: async (value) => {
          delivery = value
        },
      }),
    ).resolves.toEqual({ deliveryAttempted: true })
    expect(delivery?.expiresAt).toBe(hardDeadline.toISOString())
    await expect(verifyCloudSignupEmail(originalToken, payload!, resendAt)).rejects.toMatchObject({
      code: 'VERIFICATION_INVALID',
    })
    await expect(
      resendCloudSignupVerification(FIXTURE.resendEmail, {
        appBaseURL: 'https://app.relay.test',
        now: () => hardDeadline,
        payload: payload!,
        randomToken: () => 'T'.repeat(43),
        sendVerification: async () => undefined,
      }),
    ).resolves.toEqual({ deliveryAttempted: false })
    await expect(
      verifyCloudSignupEmail(replacementToken, payload!, new Date(hardDeadline.getTime() - 1_000)),
    ).resolves.toMatchObject({ workspaceSlug: FIXTURE.resendSlug })
  })

  it('prunes only old, exact pending graphs and leaves graphs with tenant evidence untouched', async () => {
    const createdAt = new Date()
    const safe = await signup(
      FIXTURE.pruneSafeEmail,
      FIXTURE.pruneSafeSlug,
      'U'.repeat(43),
      createdAt,
    )
    const unsafe = await signup(
      FIXTURE.pruneUnsafeEmail,
      FIXTURE.pruneUnsafeSlug,
      'V'.repeat(43),
      createdAt,
    )
    const extra = await payload!.create({
      collection: 'users',
      data: {
        email: FIXTURE.extraEmail,
        name: 'Lifecycle Extra Member',
        password: 'LifecycleExtra123!',
        role: 'viewer',
        status: 'active',
      },
      overrideAccess: true,
    })
    await payload!.create({
      collection: 'organization-memberships',
      data: {
        organization: Number(unsafe.organizationID),
        role: 'viewer',
        status: 'active',
        user: extra.id,
      },
      overrideAccess: true,
    })

    const pruneAt = new Date(
      createdAt.getTime() + 24 * 60 * 60 * 1_000 + CLOUD_PENDING_SIGNUP_RECLAIM_GRACE_MS + 1_000,
    )
    await expect(
      pruneExpiredPendingCloudSignups({
        candidateUserIDs: [Number(safe.userID), Number(unsafe.userID)],
        managedLinkRootDomain: 'links.relay.test',
        now: pruneAt,
        payload: payload!,
      }),
    ).resolves.toEqual({ pruned: 1, scanned: 2, skipped: 1 })

    const [safeUsers, unsafeUsers, unsafeOrganizations] = await Promise.all([
      payload!.count({
        collection: 'users',
        overrideAccess: true,
        where: { id: { equals: Number(safe.userID) } },
      }),
      payload!.count({
        collection: 'users',
        overrideAccess: true,
        where: { id: { equals: Number(unsafe.userID) } },
      }),
      payload!.count({
        collection: 'organizations',
        overrideAccess: true,
        where: { id: { equals: Number(unsafe.organizationID) } },
      }),
    ])
    expect(safeUsers.totalDocs).toBe(0)
    expect(unsafeUsers.totalDocs).toBe(1)
    expect(unsafeOrganizations.totalDocs).toBe(1)
  })
})
