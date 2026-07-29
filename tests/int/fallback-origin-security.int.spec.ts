import config from '@/payload.config'
import {
  buildFallbackOriginInstructions,
  evaluateFallbackOriginEvidence,
} from '@/lib/domain/fallback-origin'
import {
  beginFallbackOriginVerification,
  revokeFallbackOrigin,
  verifyFallbackOriginWithProvider,
} from '@/lib/server/fallback-origin-lifecycle'
import { MEMBERSHIP_OWNER_OVERRIDE_CONTEXT } from '@/lib/server/membership-owner-guards'
import { resolvePublicLink } from '@/lib/server/resolve-public-link'
import type { FallbackOrigin, User } from '@/payload-types'
import { createLocalReq, getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const FIXTURE = {
  app: 'fallback-origin-app',
  foreignOrganization: 'fallback-origin-foreign-org',
  foreignWorkspace: 'fallback-origin-foreign-workspace',
  organization: 'fallback-origin-org',
  origin: 'verified-fallback.example',
  pendingOrigin: 'pending-fallback.example',
  platformUser: 'fallback-platform@linksetgo.test',
  tenantUser: 'fallback-tenant@linksetgo.test',
  workspace: 'fallback-origin-workspace',
} as const

const assertTestDatabase = (): void => {
  const value = process.env.DATABASE_URL
  if (!value) throw new Error('DATABASE_URL is required for integration tests.')
  const name = decodeURIComponent(new URL(value).pathname.slice(1))
  if (!name.endsWith('_test')) throw new Error(`Refusing test cleanup against "${name}".`)
}

describe.sequential('Cloud fallback-origin ownership', () => {
  let payload: Payload | undefined
  let platformUser: User
  let tenantUser: User
  let workspaceID: number
  let foreignWorkspaceID: number
  let verifiedOrigin: FallbackOrigin
  let previousEdition: string | undefined

  const cleanup = async (): Promise<void> => {
    if (!payload) return
    const apps = await payload.find({
      collection: 'apps',
      depth: 0,
      limit: 20,
      overrideAccess: true,
      pagination: false,
      where: { slug: { in: [FIXTURE.app, 'fallback-unverified-app'] } },
    })
    if (apps.docs.length > 0) {
      await payload.delete({
        collection: 'deep-links',
        overrideAccess: true,
        where: { app: { in: apps.docs.map((app) => app.id) } },
      })
    }
    await payload.delete({
      collection: 'apps',
      overrideAccess: true,
      where: { id: { in: apps.docs.map((app) => app.id) } },
    })
    await payload.delete({
      collection: 'fallback-origins',
      overrideAccess: true,
      where: { hostname: { in: [FIXTURE.origin, FIXTURE.pendingOrigin] } },
    })
    const organizations = await payload.find({
      collection: 'organizations',
      depth: 0,
      limit: 10,
      overrideAccess: true,
      pagination: false,
      where: {
        slug: { in: [FIXTURE.organization, FIXTURE.foreignOrganization] },
      },
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
      where: { email: { in: [FIXTURE.platformUser, FIXTURE.tenantUser] } },
    })
  }

  beforeAll(async () => {
    assertTestDatabase()
    previousEdition = process.env.RELAY_EDITION
    process.env.RELAY_EDITION = 'community'
    payload = await getPayload({ config: await config })
    await cleanup()

    platformUser = await payload.create({
      collection: 'users',
      overrideAccess: true,
      data: {
        email: FIXTURE.platformUser,
        name: 'Fallback platform operator',
        password: 'FallbackPlatformPassword123!',
        role: 'super-admin',
        status: 'active',
      },
    })
    tenantUser = await payload.create({
      collection: 'users',
      overrideAccess: true,
      data: {
        email: FIXTURE.tenantUser,
        name: 'Fallback tenant owner',
        password: 'FallbackTenantPassword123!',
        role: 'admin',
        status: 'active',
      },
    })
    const organization = await payload.create({
      collection: 'organizations',
      overrideAccess: true,
      data: { name: 'Fallback Org', slug: FIXTURE.organization, status: 'active' },
    })
    const foreignOrganization = await payload.create({
      collection: 'organizations',
      overrideAccess: true,
      data: {
        name: 'Fallback Foreign Org',
        slug: FIXTURE.foreignOrganization,
        status: 'active',
      },
    })
    const workspace = await payload.create({
      collection: 'workspaces',
      overrideAccess: true,
      data: {
        name: 'Fallback workspace',
        organization: organization.id,
        slug: FIXTURE.workspace,
        status: 'active',
      },
    })
    const foreignWorkspace = await payload.create({
      collection: 'workspaces',
      overrideAccess: true,
      data: {
        name: 'Fallback foreign workspace',
        organization: foreignOrganization.id,
        slug: FIXTURE.foreignWorkspace,
        status: 'active',
      },
    })
    workspaceID = workspace.id
    foreignWorkspaceID = foreignWorkspace.id
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
  })

  afterAll(async () => {
    process.env.RELAY_EDITION = previousEdition
    if (!payload) return
    try {
      await cleanup()
    } finally {
      await payload.destroy()
    }
  })

  it('keeps DNS verification exact and provider-neutral', () => {
    const instructions = buildFallbackOriginInstructions({
      hostname: 'Verified-Fallback.Example.',
      verificationToken: 'abcdefghijklmnopqrstuvwxyz123456',
    })
    expect(instructions).toEqual({
      name: '_linksetgo-fallback.verified-fallback.example',
      type: 'TXT',
      value: 'linksetgo-fallback-verification=abcdefghijklmnopqrstuvwxyz123456',
    })
    expect(
      evaluateFallbackOriginEvidence(instructions!, {
        txtValues: ['linksetgo-fallback-verification=copied-token'],
      }),
    ).toMatchObject({ ok: false, code: 'OWNERSHIP_CHALLENGE_MISSING' })
  })

  it('denies a tenant registering an origin for another workspace', async () => {
    await expect(
      payload!.create({
        collection: 'fallback-origins',
        overrideAccess: true,
        user: tenantUser,
        data: {
          hostname: 'foreign-forged.example',
          status: 'pending',
          verificationToken: 'ignored-generated-token-123456789',
          workspace: foreignWorkspaceID,
        },
      }),
    ).rejects.toThrow(/workspace you are allowed to manage/i)
  })

  it('verifies only the generated TXT record and stores hashes instead of raw values', async () => {
    verifiedOrigin = await payload!.create({
      collection: 'fallback-origins',
      overrideAccess: true,
      user: platformUser,
      data: {
        hostname: FIXTURE.origin,
        status: 'pending',
        verificationToken: 'ignored-generated-token-123456789',
        workspace: workspaceID,
      },
    })
    const req = await createLocalReq({ user: platformUser }, payload!)
    await expect(
      beginFallbackOriginVerification({ id: verifiedOrigin.id, payload: payload!, req }),
    ).resolves.toMatchObject({ ok: true, origin: { status: 'verifying' } })

    const expected = buildFallbackOriginInstructions(verifiedOrigin)!
    const lookedUp: string[] = []
    const result = await verifyFallbackOriginWithProvider({
      id: verifiedOrigin.id,
      payload: payload!,
      req,
      provider: {
        lookupTXT: async (recordName) => {
          lookedUp.push(recordName)
          return { observedAt: '2026-07-27T07:00:00.000Z', values: [expected.value] }
        },
      },
    })
    expect(result).toMatchObject({ ok: true, origin: { status: 'verified' } })
    expect(lookedUp).toEqual([expected.name])
    expect(JSON.stringify(result.origin.lastEvidence)).not.toContain(expected.value)
  })

  it('blocks forged/unverified hosts, then fails closed immediately after revocation', async () => {
    await payload!.create({
      collection: 'fallback-origins',
      overrideAccess: true,
      user: platformUser,
      data: {
        hostname: FIXTURE.pendingOrigin,
        status: 'pending',
        verificationToken: 'ignored-generated-token-123456789',
        workspace: workspaceID,
      },
    })
    process.env.RELAY_EDITION = 'cloud'

    await expect(
      payload!.create({
        collection: 'apps',
        overrideAccess: true,
        user: platformUser,
        data: {
          fallbackUrl: `https://${FIXTURE.pendingOrigin}/download`,
          iosBundleId: 'com.relay.unverified',
          iosTeamId: 'A1B2C3D4E5',
          name: 'Unverified fallback app',
          nativeScheme: 'relayunverified',
          slug: 'fallback-unverified-app',
          status: 'active',
          workspace: workspaceID,
        },
      }),
    ).rejects.toThrow(/verify fallback origin ownership/i)

    const app = await payload!.create({
      collection: 'apps',
      overrideAccess: true,
      user: platformUser,
      data: {
        fallbackUrl: `https://${FIXTURE.origin}/download`,
        iosBundleId: 'com.relay.verified',
        iosTeamId: 'A1B2C3D4E5',
        name: 'Verified fallback app',
        nativeScheme: 'relayverified',
        slug: FIXTURE.app,
        status: 'active',
        workspace: workspaceID,
      },
    })
    await expect(
      payload!.create({
        collection: 'deep-links',
        overrideAccess: true,
        user: platformUser,
        data: {
          app: app.id,
          destinationPath: '/forged',
          fallbackUrl: 'https://attacker.example/phish',
          name: 'Forged fallback',
          slug: 'forged',
          status: 'active',
        },
      }),
    ).rejects.toThrow(/not allowed for this app/i)

    await payload!.create({
      collection: 'deep-links',
      overrideAccess: true,
      user: platformUser,
      data: {
        app: app.id,
        destinationPath: '/offer',
        name: 'Verified offer',
        slug: 'offer',
        status: 'active',
      },
    })
    await expect(
      resolvePublicLink({
        appSlug: FIXTURE.app,
        baseURL: 'https://links.linksetgo.example',
        linkSlug: 'offer',
        workspaceID: String(workspaceID),
      }),
    ).resolves.toMatchObject({ ok: true })

    const req = await createLocalReq({ user: platformUser }, payload!)
    await revokeFallbackOrigin({ id: verifiedOrigin.id, payload: payload!, req })
    await expect(
      resolvePublicLink({
        appSlug: FIXTURE.app,
        baseURL: 'https://links.linksetgo.example',
        linkSlug: 'offer',
        workspaceID: String(workspaceID),
      }),
    ).resolves.toMatchObject({
      ok: false,
      httpStatus: 410,
      body: { error: { code: 'FALLBACK_UNAVAILABLE' } },
    })
  })
})
