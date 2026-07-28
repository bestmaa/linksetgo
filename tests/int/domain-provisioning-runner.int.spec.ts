import type { DomainProvisioningProvider } from '@/lib/application/domain-provisioning-provider'
import { confirmCustomDomainRelease } from '@/lib/server/domain-release-confirmation'
import { runCustomDomainProvisioning } from '@/lib/server/domain-provisioning-runner'
import { MEMBERSHIP_OWNER_OVERRIDE_CONTEXT } from '@/lib/server/membership-owner-guards'
import type { Domain, Organization, User, Workspace } from '@/payload-types'
import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const fixture = {
  app: 'domain-provisioner-app',
  domain: 'provisioner-domain.relay.test',
  organization: 'domain-provisioner-org',
  user: 'domain-provisioner@relay.test',
  workspace: 'domain-provisioner-workspace',
} as const

const fingerprint =
  'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99'

const assertTestDatabase = (): void => {
  const databaseURL = process.env.DATABASE_URL
  if (!databaseURL) throw new Error('DATABASE_URL is required for integration tests.')
  const databaseName = decodeURIComponent(new URL(databaseURL).pathname.slice(1))
  if (!databaseName.endsWith('_test')) {
    throw new Error(`Refusing to run integration cleanup against "${databaseName}".`)
  }
}

describe.sequential('custom-domain provisioning transaction', () => {
  let payload: Payload | undefined
  let user: User
  let organization: Organization
  let workspace: Workspace
  let domain: Domain

  const cleanup = async (): Promise<void> => {
    if (!payload) return
    await payload.delete({
      collection: 'domains',
      overrideAccess: true,
      where: { hostname: { equals: fixture.domain } },
    })
    await payload.delete({
      collection: 'apps',
      overrideAccess: true,
      where: { slug: { equals: fixture.app } },
    })
    const organizations = await payload.find({
      collection: 'organizations',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      where: { slug: { equals: fixture.organization } },
    })
    if (organizations.docs[0]) {
      await payload.delete({
        collection: 'organization-memberships',
        context: { [MEMBERSHIP_OWNER_OVERRIDE_CONTEXT]: true },
        overrideAccess: true,
        where: { organization: { equals: organizations.docs[0].id } },
      })
      await payload.delete({
        collection: 'workspaces',
        overrideAccess: true,
        where: { organization: { equals: organizations.docs[0].id } },
      })
      await payload.delete({
        collection: 'organizations',
        id: organizations.docs[0].id,
        overrideAccess: true,
      })
    }
    await payload.delete({
      collection: 'users',
      overrideAccess: true,
      where: { email: { equals: fixture.user } },
    })
  }

  beforeAll(async () => {
    assertTestDatabase()
    vi.stubEnv('MANAGED_INGRESS_CNAME_TARGET', 'ingress.relay.test')
    const config = (await import('@/payload.config')).default
    payload = await getPayload({ config: await config })
    await cleanup()

    user = await payload.create({
      collection: 'users',
      overrideAccess: true,
      data: {
        email: fixture.user,
        name: 'Domain provisioner owner',
        password: 'DomainProvisionerPassword123!',
        role: 'admin',
        status: 'active',
      },
    })
    organization = await payload.create({
      collection: 'organizations',
      overrideAccess: true,
      data: { name: 'Domain provisioner', slug: fixture.organization, status: 'active' },
    })
    workspace = await payload.create({
      collection: 'workspaces',
      overrideAccess: true,
      data: {
        name: 'Domain provisioner workspace',
        organization: organization.id,
        slug: fixture.workspace,
        status: 'active',
      },
    })
    await payload.create({
      collection: 'organization-memberships',
      overrideAccess: true,
      data: {
        organization: organization.id,
        role: 'owner',
        status: 'active',
        user: user.id,
      },
    })
    await payload.create({
      collection: 'apps',
      overrideAccess: true,
      data: {
        androidPackageName: 'com.relay.domainprovisioner',
        androidSha256CertFingerprints: [fingerprint],
        fallbackUrl: 'https://domain-provisioner.example',
        name: 'Domain provisioner app',
        nativeScheme: 'relayprovisioner',
        slug: fixture.app,
        status: 'active',
        workspace: workspace.id,
      },
    })
    domain = await payload.create({
      collection: 'domains',
      overrideAccess: true,
      data: {
        hostname: fixture.domain,
        status: 'pending-dns',
        type: 'custom',
        verificationToken: 'domain-provisioner-verification-token-123',
        workspace: workspace.id,
      },
    })
  })

  afterAll(async () => {
    if (!payload) return
    try {
      await cleanup()
    } finally {
      await payload.destroy()
      vi.unstubAllEnvs()
    }
  })

  it('serializes concurrent checks, stores TLS evidence, and waits for owner confirmation', async () => {
    const inspectDNS = vi.fn(async () => ({
      kind: 'success' as const,
      value: {
        cnameTargets: ['ingress.relay.test'],
        txtValues: [`relay-domain-verification=${domain.verificationToken}`],
      },
    }))
    const requestCertificate = vi.fn(async () => ({
      kind: 'success' as const,
      value: {
        certificateID: 'certificate-provider-reference',
        kind: 'ready' as const,
        renewsAt: '2027-07-27T00:00:00.000Z',
      },
    }))
    const provider: DomainProvisioningProvider = { inspectDNS, requestCertificate }
    const input = {
      domainID: String(domain.id),
      payload: payload!,
      provider,
      user,
      workspaceID: String(workspace.id),
    }

    const outcomes = await Promise.all([
      runCustomDomainProvisioning(input),
      runCustomDomainProvisioning(input),
    ])
    expect(outcomes.every((outcome) => outcome.ok)).toBe(true)
    expect(outcomes.map((outcome) => (outcome.ok ? outcome.stage : null))).toEqual([
      'association-confirmation-required',
      'association-confirmation-required',
    ])
    expect(inspectDNS).toHaveBeenCalledOnce()
    expect(requestCertificate).toHaveBeenCalledOnce()

    domain = await payload!.findByID({
      collection: 'domains',
      id: domain.id,
      depth: 0,
      overrideAccess: true,
    })
    expect(domain).toMatchObject({
      status: 'association-incomplete',
      tlsCertificateRef: 'certificate-provider-reference',
      tlsRenewsAt: '2027-07-27T00:00:00.000Z',
    })

    await expect(
      confirmCustomDomainRelease({
        confirmedHostname: 'another-domain.relay.test',
        domainID: String(domain.id),
        payload: payload!,
        user,
        workspaceID: String(workspace.id),
      }),
    ).resolves.toMatchObject({ code: 'RELEASE_NOT_READY', ok: false, status: 409 })

    await expect(
      confirmCustomDomainRelease({
        confirmedHostname: fixture.domain,
        domainID: String(domain.id),
        payload: payload!,
        user,
        workspaceID: String(workspace.id),
      }),
    ).resolves.toMatchObject({ ok: true, stage: 'active' })
    await expect(
      payload!.findByID({
        collection: 'domains',
        id: domain.id,
        depth: 0,
        overrideAccess: true,
      }),
    ).resolves.toMatchObject({
      associationsVerifiedAt: expect.any(String),
      status: 'active',
    })
  })

  it('does not reveal a domain through a forged workspace ID', async () => {
    const provider: DomainProvisioningProvider = {
      inspectDNS: vi.fn(),
      requestCertificate: vi.fn(),
    }
    await expect(
      runCustomDomainProvisioning({
        domainID: String(domain.id),
        payload: payload!,
        provider,
        user,
        workspaceID: `${workspace.id}999`,
      }),
    ).resolves.toMatchObject({ code: 'NOT_FOUND', ok: false, status: 404 })
    expect(provider.inspectDNS).not.toHaveBeenCalled()
  })
})
