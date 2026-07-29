import type { App, Domain, Organization, User, Workspace } from '@/payload-types'
import config from '@/payload.config'
import { GET as getAppleAssociation } from '@/app/.well-known/apple-app-site-association/route'
import { GET as getAndroidAssociation } from '@/app/.well-known/assetlinks.json/route'
import { buildAndroidAssociation, buildAppleAssociation } from '@/lib/domain/associations'
import { loadAssociationApps } from '@/lib/server/load-association-apps'
import { MEMBERSHIP_OWNER_OVERRIDE_CONTEXT } from '@/lib/server/membership-owner-guards'
import { resolvePublicHost } from '@/lib/server/resolve-public-host'
import { resolvePublicLink } from '@/lib/server/resolve-public-link'
import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const FIXTURE = {
  appA: 'domain-alpha-app',
  appB: 'domain-beta-app',
  domainA: 'alpha-domain.linksetgo.test',
  domainB: 'beta-domain.linksetgo.test',
  organizationA: 'domain-alpha',
  organizationB: 'domain-beta',
  platformUser: 'domain-platform@linksetgo.test',
  userA: 'domain-alpha@linksetgo.test',
  userB: 'domain-beta@linksetgo.test',
  workspaceA: 'domain-alpha-workspace',
  workspaceB: 'domain-beta-workspace',
} as const

const assertTestDatabase = (): void => {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is required for integration tests.')

  const databaseName = decodeURIComponent(new URL(connectionString).pathname.slice(1))
  if (!databaseName.endsWith('_test')) {
    throw new Error(`Refusing to run integration cleanup against "${databaseName}".`)
  }
}

describe.sequential('workspace domain isolation', () => {
  let payload: Payload | undefined
  let organizationA: Organization
  let organizationB: Organization
  let workspaceA: Workspace
  let workspaceB: Workspace
  let userA: User
  let userB: User
  let appA: App
  let appB: App
  let domainA: Domain
  let domainB: Domain

  const cleanup = async (): Promise<void> => {
    if (!payload) return

    await payload.delete({
      collection: 'domains',
      overrideAccess: true,
      where: { hostname: { in: [FIXTURE.domainA, FIXTURE.domainB] } },
    })
    const apps = await payload.find({
      collection: 'apps',
      depth: 0,
      limit: 10,
      overrideAccess: true,
      pagination: false,
      where: { slug: { in: [FIXTURE.appA, FIXTURE.appB] } },
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
      where: { slug: { in: [FIXTURE.appA, FIXTURE.appB] } },
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
      const workspaces = await payload.find({
        collection: 'workspaces',
        depth: 0,
        limit: 10,
        overrideAccess: true,
        pagination: false,
        where: { organization: { in: organizationIDs } },
      })
      const workspaceIDs = workspaces.docs.map((workspace) => workspace.id)
      if (workspaceIDs.length > 0) {
        await payload.delete({
          collection: 'domains',
          overrideAccess: true,
          where: { workspace: { in: workspaceIDs } },
        })
      }
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

  const activate = async (domain: Domain): Promise<Domain> => {
    const verifiedAt = '2026-07-27T05:00:00.000Z'
    await payload!.update({
      collection: 'domains',
      id: domain.id,
      overrideAccess: true,
      data: { status: 'verifying' },
    })
    await payload!.update({
      collection: 'domains',
      id: domain.id,
      overrideAccess: true,
      data: {
        cnameVerifiedAt: verifiedAt,
        dnsVerifiedAt: verifiedAt,
        status: 'certificate-ready',
        tlsReadyAt: verifiedAt,
      },
    })
    await payload!.update({
      collection: 'domains',
      id: domain.id,
      overrideAccess: true,
      data: { status: 'association-incomplete' },
    })
    return payload!.update({
      collection: 'domains',
      id: domain.id,
      overrideAccess: true,
      data: {
        activatedAt: verifiedAt,
        associationsVerifiedAt: verifiedAt,
        status: 'active',
      },
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
        name: 'Domain platform admin',
        password: 'DomainPlatformPassword123!',
        role: 'super-admin',
        status: 'active',
      },
    })
    userA = await payload.create({
      collection: 'users',
      overrideAccess: true,
      data: {
        email: FIXTURE.userA,
        name: 'Domain Alpha owner',
        password: 'DomainAlphaPassword123!',
        role: 'admin',
        status: 'active',
      },
    })
    userB = await payload.create({
      collection: 'users',
      overrideAccess: true,
      data: {
        email: FIXTURE.userB,
        name: 'Domain Beta owner',
        password: 'DomainBetaPassword123!',
        role: 'admin',
        status: 'active',
      },
    })
    organizationA = await payload.create({
      collection: 'organizations',
      overrideAccess: true,
      data: { name: 'Domain Alpha', slug: FIXTURE.organizationA, status: 'active' },
    })
    organizationB = await payload.create({
      collection: 'organizations',
      overrideAccess: true,
      data: { name: 'Domain Beta', slug: FIXTURE.organizationB, status: 'active' },
    })
    workspaceA = await payload.create({
      collection: 'workspaces',
      overrideAccess: true,
      data: {
        name: 'Domain Alpha workspace',
        organization: organizationA.id,
        slug: FIXTURE.workspaceA,
        status: 'active',
      },
    })
    workspaceB = await payload.create({
      collection: 'workspaces',
      overrideAccess: true,
      data: {
        name: 'Domain Beta workspace',
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

    const fingerprint =
      'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99'
    appA = await payload.create({
      collection: 'apps',
      overrideAccess: true,
      data: {
        androidPackageName: 'com.example.domainalpha',
        androidSha256CertFingerprints: [fingerprint],
        fallbackUrl: 'https://alpha.linksetgo.test',
        iosBundleId: 'com.example.domainalpha',
        iosTeamId: 'ALPHA12345',
        name: 'Domain Alpha app',
        slug: FIXTURE.appA,
        status: 'active',
        workspace: workspaceA.id,
      },
    })
    appB = await payload.create({
      collection: 'apps',
      overrideAccess: true,
      data: {
        androidPackageName: 'com.example.domainbeta',
        androidSha256CertFingerprints: [fingerprint],
        fallbackUrl: 'https://beta.linksetgo.test',
        iosBundleId: 'com.example.domainbeta',
        iosTeamId: 'BETA123456',
        name: 'Domain Beta app',
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
          name: 'Domain Alpha link',
          slug: 'offer',
          status: 'active',
        },
      }),
      payload.create({
        collection: 'deep-links',
        overrideAccess: true,
        data: {
          app: appB.id,
          destinationPath: '/beta',
          name: 'Domain Beta link',
          slug: 'offer',
          status: 'active',
        },
      }),
    ])

    domainA = await payload.create({
      collection: 'domains',
      overrideAccess: true,
      data: {
        hostname: 'Alpha-Domain.LinksetGo.Test.',
        status: 'pending-dns',
        type: 'custom',
        verificationToken: 'alpha-domain-verification-token-123456',
        workspace: workspaceA.id,
      },
    })
    domainB = await payload.create({
      collection: 'domains',
      overrideAccess: true,
      data: {
        hostname: FIXTURE.domainB,
        status: 'pending-dns',
        type: 'custom',
        verificationToken: 'beta-domain-verification-token-1234567',
        workspace: workspaceB.id,
      },
    })
    domainA = await activate(domainA)
    domainB = await activate(domainB)
  })

  afterAll(async () => {
    if (!payload) return
    try {
      await cleanup()
    } finally {
      await payload.destroy()
    }
  })

  it('normalizes hostnames and enforces exact global collision protection', async () => {
    expect(domainA.hostname).toBe(FIXTURE.domainA)

    await expect(
      payload!.create({
        collection: 'domains',
        overrideAccess: true,
        data: {
          hostname: 'ALPHA-DOMAIN.LINKSETGO.TEST.',
          status: 'pending-dns',
          type: 'custom',
          verificationToken: 'collision-verification-token-12345678',
          workspace: workspaceB.id,
        },
      }),
    ).rejects.toThrow()

    await expect(
      payload!.create({
        collection: 'domains',
        overrideAccess: true,
        data: {
          hostname: '127.0.0.1',
          status: 'pending-dns',
          type: 'custom',
          verificationToken: 'legacy-collision-token-1234567890',
          workspace: workspaceB.id,
        },
      }),
    ).rejects.toThrow(/legacy hostname is reserved/i)
  })

  it('scopes domain collection reads and writes by workspace membership', async () => {
    const [domainsForA, domainsForB] = await Promise.all([
      payload!.find({ collection: 'domains', overrideAccess: false, user: userA }),
      payload!.find({ collection: 'domains', overrideAccess: false, user: userB }),
    ])
    expect(domainsForA.docs.map((domain) => domain.hostname)).toContain(FIXTURE.domainA)
    expect(domainsForA.docs.map((domain) => domain.hostname)).not.toContain(FIXTURE.domainB)
    expect(domainsForB.docs.map((domain) => domain.hostname)).toContain(FIXTURE.domainB)
    expect(domainsForB.docs.map((domain) => domain.hostname)).not.toContain(FIXTURE.domainA)

    await expect(
      payload!.create({
        collection: 'domains',
        overrideAccess: false,
        user: userA,
        data: {
          hostname: 'blocked-cross-tenant.linksetgo.test',
          status: 'pending-dns',
          type: 'custom',
          verificationToken: 'blocked-verification-token-123456789',
          workspace: workspaceB.id,
        },
      }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('resolves an exact host to one workspace and ignores forged forwarded-host by default', async () => {
    const host = await resolvePublicHost(
      new Request('https://internal.linksetgo.test/l/x/y', {
        headers: {
          host: FIXTURE.domainA,
          'x-forwarded-host': FIXTURE.domainB,
        },
      }),
      'resolver',
    )
    expect(host).toMatchObject({
      ok: true,
      hostname: FIXTURE.domainA,
      kind: 'domain',
      workspaceID: String(workspaceA.id),
    })

    await expect(
      resolvePublicHost(
        new Request('https://forged.linksetgo.test/l/x/y', {
          headers: { host: 'unknown-domain.linksetgo.test' },
        }),
        'resolver',
      ),
    ).resolves.toEqual({
      ok: false,
      code: 'UNRECOGNIZED_HOST',
      httpStatus: 404,
    })
  })

  it('stops routing when the owning organization is suspended', async () => {
    await payload!.update({
      collection: 'organizations',
      id: organizationA.id,
      overrideAccess: true,
      data: { status: 'suspended' },
    })

    try {
      await expect(
        resolvePublicHost(
          new Request(`https://${FIXTURE.domainA}/l/x/y`, {
            headers: { host: FIXTURE.domainA },
          }),
          'resolver',
        ),
      ).resolves.toEqual({
        ok: false,
        code: 'UNRECOGNIZED_HOST',
        httpStatus: 404,
      })
    } finally {
      organizationA = await payload!.update({
        collection: 'organizations',
        id: organizationA.id,
        overrideAccess: true,
        data: { status: 'active' },
      })
    }
  })

  it('never resolves another workspace app through the selected hostname', async () => {
    const ownResult = await resolvePublicLink({
      appSlug: appA.slug,
      baseURL: `https://${FIXTURE.domainA}`,
      linkSlug: 'offer',
      workspaceID: String(workspaceA.id),
    })
    expect(ownResult).toMatchObject({
      ok: true,
      body: { publicUrl: `https://${FIXTURE.domainA}/l/${FIXTURE.appA}/offer` },
    })

    const crossTenantResult = await resolvePublicLink({
      appSlug: appB.slug,
      baseURL: `https://${FIXTURE.domainA}`,
      linkSlug: 'offer',
      workspaceID: String(workspaceA.id),
    })
    expect(crossTenantResult).toMatchObject({
      ok: false,
      body: { error: { code: 'APP_NOT_FOUND' } },
    })
  })

  it('publishes only the selected workspace app in both association formats', async () => {
    const appsForA = await loadAssociationApps(String(workspaceA.id))
    const apple = buildAppleAssociation(appsForA)
    const android = buildAndroidAssociation(appsForA)

    expect(appsForA.map((app) => app.slug)).toEqual([FIXTURE.appA])
    expect(apple.applinks.details.map((detail) => detail.appID)).toEqual([
      'ALPHA12345.com.example.domainalpha',
    ])
    expect(android.map((entry) => entry.target.package_name)).toEqual(['com.example.domainalpha'])
    expect(JSON.stringify({ android, apple })).not.toContain('domainbeta')
  })

  it('keeps the actual AASA and Asset Links routes isolated by request host', async () => {
    const [appleResponse, androidResponse, unknownHostResponse] = await Promise.all([
      getAppleAssociation(
        new Request(`https://${FIXTURE.domainA}/.well-known/apple-app-site-association`, {
          headers: { host: FIXTURE.domainA },
        }),
      ),
      getAndroidAssociation(
        new Request(`https://${FIXTURE.domainB}/.well-known/assetlinks.json`, {
          headers: { host: FIXTURE.domainB },
        }),
      ),
      getAppleAssociation(
        new Request('https://forged.linksetgo.test/.well-known/apple-app-site-association', {
          headers: { host: 'forged.linksetgo.test' },
        }),
      ),
    ])
    const appleDocument = JSON.stringify((await appleResponse.json()) as unknown)
    const androidDocument = JSON.stringify((await androidResponse.json()) as unknown)

    expect(appleResponse.status).toBe(200)
    expect(appleDocument).toContain('ALPHA12345.com.example.domainalpha')
    expect(appleDocument).not.toContain('domainbeta')
    expect(androidResponse.status).toBe(200)
    expect(androidDocument).toContain('com.example.domainbeta')
    expect(androidDocument).not.toContain('domainalpha')
    expect(unknownHostResponse.status).toBe(404)
  })
})
