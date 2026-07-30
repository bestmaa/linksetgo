import config from '@/payload.config'
import type {
  AppConsoleConfigurationInput,
  LinkConsoleConfigurationInput,
} from '@/lib/client/payload-types'
import { mutateConsoleApp } from '@/lib/server/app-console'
import { registerConsoleFallbackOrigin } from '@/lib/server/fallback-origin-console'
import { runFallbackURLSafetyAssessment } from '@/lib/server/fallback-url-safety-service'
import { mutateConsoleLink } from '@/lib/server/link-console'
import { MEMBERSHIP_OWNER_OVERRIDE_CONTEXT } from '@/lib/server/membership-owner-guards'
import type { App, DeepLink, User } from '@/payload-types'
import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const FIXTURE = {
  email: 'fallback-binding-owner@linksetgo.test',
  organization: 'fallback-binding-org',
  workspace: 'fallback-binding-workspace',
} as const
const androidFingerprint = Array.from({ length: 32 }, () => 'AA').join(':')
const previousEdition = process.env.RELAY_EDITION

const assertTestDatabase = (): void => {
  const value = process.env.DATABASE_URL
  if (!value) throw new Error('DATABASE_URL is required for integration tests.')
  const name = decodeURIComponent(new URL(value).pathname.slice(1))
  if (!name.endsWith('_test')) throw new Error(`Refusing test cleanup against "${name}".`)
}

const appConfiguration = (app: App, fallbackUrl: string): AppConsoleConfigurationInput => ({
  androidPackageName: app.androidPackageName ?? '',
  androidSha256CertFingerprints: app.androidSha256CertFingerprints ?? [],
  appStoreUrl: app.appStoreUrl ?? '',
  description: app.description ?? '',
  fallbackUrl,
  iosBundleId: app.iosBundleId ?? '',
  iosTeamId: app.iosTeamId ?? '',
  name: app.name,
  nativeScheme: app.nativeScheme ?? '',
  playStoreUrl: app.playStoreUrl ?? '',
})

const linkConfiguration = (
  link: DeepLink,
  fallbackUrl: string | null,
): LinkConsoleConfigurationInput => ({
  destinationPath: link.destinationPath,
  expiresAt: link.expiresAt ?? null,
  fallbackUrl,
  name: link.name,
  parameters:
    typeof link.parameters === 'object' && link.parameters && !Array.isArray(link.parameters)
      ? Object.fromEntries(
          Object.entries(link.parameters).flatMap(([key, value]) =>
            typeof value === 'string' ? [[key, value]] : [],
          ),
        )
      : {},
})

describe.sequential('transactional Cloud fallback bindings', () => {
  let payload: Payload
  let user: User
  let workspaceID: number
  let app: App
  let link: DeepLink

  const cleanup = async (): Promise<void> => {
    if (!payload) return
    const organizations = await payload.find({
      collection: 'organizations',
      depth: 0,
      limit: 2,
      overrideAccess: true,
      pagination: false,
      where: { slug: { equals: FIXTURE.organization } },
    })
    const organizationIDs = organizations.docs.map(({ id }) => id)
    if (organizationIDs.length > 0) {
      const workspaces = await payload.find({
        collection: 'workspaces',
        depth: 0,
        limit: 10,
        overrideAccess: true,
        pagination: false,
        where: { organization: { in: organizationIDs } },
      })
      const workspaceIDs = workspaces.docs.map(({ id }) => id)
      const apps = await payload.find({
        collection: 'apps',
        depth: 0,
        limit: 100,
        overrideAccess: true,
        pagination: false,
        where: { workspace: { in: workspaceIDs } },
      })
      const appIDs = apps.docs.map(({ id }) => id)
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
        collection: 'fallback-url-safety-assessments',
        overrideAccess: true,
        where: { workspace: { in: workspaceIDs } },
      })
      await payload.delete({
        collection: 'fallback-origins',
        overrideAccess: true,
        where: { workspace: { in: workspaceIDs } },
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
        where: { id: { in: workspaceIDs } },
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
      where: { email: { equals: FIXTURE.email } },
    })
  }

  const assessmentCount = async (canonicalUrl: string): Promise<number> =>
    (
      await payload.count({
        collection: 'fallback-url-safety-assessments',
        overrideAccess: true,
        where: {
          and: [{ workspace: { equals: workspaceID } }, { canonicalUrl: { equals: canonicalUrl } }],
        },
      })
    ).totalDocs

  beforeAll(async () => {
    assertTestDatabase()
    process.env.RELAY_EDITION = 'cloud'
    payload = await getPayload({ config: await config })
    await cleanup()
    user = await payload.create({
      collection: 'users',
      data: {
        email: FIXTURE.email,
        name: 'Fallback Binding Owner',
        password: 'FallbackBindingOwner123!',
        role: 'admin',
        status: 'active',
      },
      overrideAccess: true,
    })
    const organization = await payload.create({
      collection: 'organizations',
      data: {
        name: 'Fallback Binding Organization',
        slug: FIXTURE.organization,
        status: 'active',
      },
      overrideAccess: true,
    })
    const workspace = await payload.create({
      collection: 'workspaces',
      data: {
        name: 'Fallback Binding Workspace',
        organization: organization.id,
        slug: FIXTURE.workspace,
        status: 'active',
      },
      overrideAccess: true,
    })
    workspaceID = workspace.id
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
  })

  afterAll(async () => {
    try {
      process.env.RELAY_EDITION = 'community'
      await cleanup()
    } finally {
      await payload?.destroy()
      if (previousEdition === undefined) delete process.env.RELAY_EDITION
      else process.env.RELAY_EDITION = previousEdition
    }
  })

  it('routes direct app and link collection writes through one binding lifecycle', async () => {
    const sharedURL = 'https://shared-binding.example/download'
    app = await payload.create({
      collection: 'apps',
      data: {
        androidPackageName: 'com.linksetgo.binding',
        androidSha256CertFingerprints: [androidFingerprint],
        fallbackUrl: sharedURL,
        name: 'Binding App',
        nativeScheme: 'bindingapp',
        routingMode: 'scheme-handoff',
        slug: 'binding-app',
        status: 'draft',
        workspace: workspaceID,
      },
      depth: 0,
      overrideAccess: false,
      user,
    })
    expect(app.fallbackUrl).toBe(sharedURL)
    await expect(assessmentCount(sharedURL)).resolves.toBe(1)

    link = await payload.create({
      collection: 'deep-links',
      data: {
        app: app.id,
        destinationPath: '/offer',
        fallbackUrl: sharedURL,
        name: 'Shared fallback',
        slug: 'shared-fallback',
        status: 'draft',
      },
      depth: 0,
      overrideAccess: false,
      user,
    })
    await expect(assessmentCount(sharedURL)).resolves.toBe(1)

    const replacementURL = 'https://replacement-binding.example/download'
    app = await payload.update({
      collection: 'apps',
      id: app.id,
      data: { fallbackUrl: replacementURL },
      depth: 0,
      overrideAccess: false,
      user,
    })
    await expect(assessmentCount(sharedURL)).resolves.toBe(1)
    await expect(assessmentCount(replacementURL)).resolves.toBe(1)

    link = await payload.update({
      collection: 'deep-links',
      id: link.id,
      data: { fallbackUrl: null },
      depth: 0,
      overrideAccess: false,
      user,
    })
    await expect(assessmentCount(sharedURL)).resolves.toBe(0)

    app = await payload.update({
      collection: 'apps',
      id: app.id,
      data: { fallbackUrl: null },
      depth: 0,
      overrideAccess: false,
      user,
    })
    await expect(assessmentCount(replacementURL)).resolves.toBe(0)
  })

  it('rolls back safety rows when a later resource guard rejects the write', async () => {
    const rollbackURL = 'https://rollback-binding.example/download'
    await expect(
      payload.create({
        collection: 'apps',
        data: {
          androidPackageName: 'com.linksetgo.duplicatebinding',
          androidSha256CertFingerprints: [androidFingerprint],
          fallbackUrl: rollbackURL,
          name: 'Duplicate Binding App',
          nativeScheme: 'duplicatebinding',
          routingMode: 'scheme-handoff',
          slug: app.slug,
          status: 'draft',
          workspace: workspaceID,
        },
        depth: 0,
        overrideAccess: false,
        user,
      }),
    ).rejects.toThrow()

    await expect(assessmentCount(rollbackURL)).resolves.toBe(0)
    await expect(
      payload.count({
        collection: 'fallback-origins',
        overrideAccess: true,
        where: {
          and: [
            { workspace: { equals: workspaceID } },
            { hostname: { equals: 'rollback-binding.example' } },
          ],
        },
      }),
    ).resolves.toMatchObject({ totalDocs: 0 })
  })

  it('uses the same binding lifecycle for app and link console edits', async () => {
    const consoleURL = 'https://console-binding.example/download'
    await expect(
      mutateConsoleApp(payload, user, String(app.id), {
        action: 'save',
        configuration: appConfiguration(app, consoleURL),
        workspaceId: String(workspaceID),
      }),
    ).resolves.toMatchObject({ ok: true })
    await expect(assessmentCount(consoleURL)).resolves.toBe(1)

    await expect(
      mutateConsoleLink(payload, user, String(link.id), {
        action: 'save',
        configuration: linkConfiguration(link, consoleURL),
        workspaceId: String(workspaceID),
      }),
    ).resolves.toMatchObject({ ok: true })

    app = await payload.findByID({
      collection: 'apps',
      id: app.id,
      depth: 0,
      overrideAccess: true,
    })
    await expect(
      mutateConsoleApp(payload, user, String(app.id), {
        action: 'save',
        configuration: appConfiguration(app, ''),
        workspaceId: String(workspaceID),
      }),
    ).resolves.toMatchObject({ ok: true })
    await expect(assessmentCount(consoleURL)).resolves.toBe(1)

    link = await payload.findByID({
      collection: 'deep-links',
      id: link.id,
      depth: 0,
      overrideAccess: true,
    })
    await expect(
      mutateConsoleLink(payload, user, String(link.id), {
        action: 'save',
        configuration: linkConfiguration(link, null),
        workspaceId: String(workspaceID),
      }),
    ).resolves.toMatchObject({ ok: true })
    await expect(assessmentCount(consoleURL)).resolves.toBe(0)
  })

  it('retains checked orphan verdicts so A to B to A does not purchase another scan', async () => {
    const firstURL = 'https://verdict-cache.fallback-binding.example/first'
    const secondURL = 'https://verdict-cache.fallback-binding.example/second'
    app = await payload.update({
      collection: 'apps',
      id: app.id,
      data: { fallbackUrl: firstURL },
      depth: 0,
      overrideAccess: false,
      user,
    })
    const origins = await payload.find({
      collection: 'fallback-origins',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      where: {
        and: [
          { workspace: { equals: workspaceID } },
          { hostname: { equals: 'verdict-cache.fallback-binding.example' } },
        ],
      },
    })
    const origin = origins.docs[0]
    expect(origin).toBeDefined()
    let providerCalls = 0
    const assessed = await runFallbackURLSafetyAssessment({
      originId: origin!.id,
      payload,
      providerConfiguration: {
        available: true,
        maxAgeMs: 60 * 60 * 1_000,
        provider: {
          assessURL: async () => {
            providerCalls += 1
            return {
              kind: 'safe',
              observedAt: new Date().toISOString(),
              redirectCount: 0,
            }
          },
        },
      },
      url: firstURL,
      workspaceId: workspaceID,
    })

    app = await payload.update({
      collection: 'apps',
      id: app.id,
      data: { fallbackUrl: secondURL },
      depth: 0,
      overrideAccess: false,
      user,
    })
    await expect(assessmentCount(firstURL)).resolves.toBe(1)
    await expect(assessmentCount(secondURL)).resolves.toBe(1)

    app = await payload.update({
      collection: 'apps',
      id: app.id,
      data: { fallbackUrl: firstURL },
      depth: 0,
      overrideAccess: false,
      user,
    })
    expect(providerCalls).toBe(1)
    await expect(assessmentCount(firstURL)).resolves.toBe(1)
    await expect(assessmentCount(secondURL)).resolves.toBe(0)

    app = await payload.update({
      collection: 'apps',
      id: app.id,
      data: { fallbackUrl: null },
      depth: 0,
      overrideAccess: false,
      user,
    })
    await payload.delete({
      collection: 'fallback-url-safety-assessments',
      id: assessed.id,
      overrideAccess: true,
    })
  })

  it('enforces the exact-URL assessment cap before saved-link creation can amplify scans', async () => {
    const hostname = 'assessment-cap.fallback-binding.example'
    const appURL = `https://${hostname}/app`
    app = await payload.update({
      collection: 'apps',
      id: app.id,
      data: { fallbackUrl: appURL },
      depth: 0,
      overrideAccess: false,
      user,
    })
    link = await payload.update({
      collection: 'deep-links',
      id: link.id,
      data: { fallbackUrl: `https://${hostname}/link-0` },
      depth: 0,
      overrideAccess: false,
      user,
    })

    const extraLinks: DeepLink[] = []
    for (let index = 1; index < 25; index += 1) {
      extraLinks.push(
        await payload.create({
          collection: 'deep-links',
          data: {
            app: app.id,
            destinationPath: `/cap-${index}`,
            fallbackUrl: `https://${hostname}/link-${index}`,
            name: `Assessment cap ${index}`,
            slug: `assessment-cap-${index}`,
            status: 'draft',
          },
          depth: 0,
          overrideAccess: false,
          user,
        }),
      )
    }
    await expect(
      payload.count({
        collection: 'fallback-url-safety-assessments',
        overrideAccess: true,
        where: { workspace: { equals: workspaceID } },
      }),
    ).resolves.toMatchObject({ totalDocs: 26 })

    const replacementAtCap = `https://${hostname}/replacement-at-cap`
    app = await payload.update({
      collection: 'apps',
      id: app.id,
      data: { fallbackUrl: replacementAtCap },
      depth: 0,
      overrideAccess: false,
      user,
    })
    await expect(assessmentCount(appURL)).resolves.toBe(0)
    await expect(assessmentCount(replacementAtCap)).resolves.toBe(1)
    await expect(
      payload.count({
        collection: 'fallback-url-safety-assessments',
        overrideAccess: true,
        where: { workspace: { equals: workspaceID } },
      }),
    ).resolves.toMatchObject({ totalDocs: 26 })

    await expect(
      payload.create({
        collection: 'deep-links',
        data: {
          app: app.id,
          destinationPath: '/cap-overflow',
          fallbackUrl: `https://${hostname}/overflow`,
          name: 'Assessment cap overflow',
          slug: 'assessment-cap-overflow',
          status: 'draft',
        },
        depth: 0,
        overrideAccess: false,
        user,
      }),
    ).rejects.toThrow(/fallback URLs safety limit/i)
    await expect(assessmentCount(`https://${hostname}/overflow`)).resolves.toBe(0)

    await payload.delete({
      collection: 'deep-links',
      overrideAccess: true,
      where: { id: { in: extraLinks.map(({ id }) => id) } },
    })
    link = await payload.update({
      collection: 'deep-links',
      id: link.id,
      data: { fallbackUrl: null },
      depth: 0,
      overrideAccess: false,
      user,
    })
    app = await payload.update({
      collection: 'apps',
      id: app.id,
      data: { fallbackUrl: null },
      depth: 0,
      overrideAccess: false,
      user,
    })
    await expect(
      payload.count({
        collection: 'fallback-url-safety-assessments',
        overrideAccess: true,
        where: { workspace: { equals: workspaceID } },
      }),
    ).resolves.toMatchObject({ totalDocs: 0 })
  })

  it('serializes the Cloud Free origin cap while reclaiming unused attempts', async () => {
    await payload.delete({
      collection: 'fallback-origins',
      overrideAccess: true,
      where: { workspace: { equals: workspaceID } },
    })

    const attempts = await Promise.allSettled(
      Array.from({ length: 6 }, (_, index) =>
        payload.create({
          collection: 'fallback-origins',
          data: {
            hostname: `quota-${index}.fallback-binding.example`,
            status: 'pending',
            verificationToken: 'generated-by-server',
            workspace: workspaceID,
          },
          depth: 0,
          overrideAccess: false,
          user,
        }),
      ),
    )
    expect(attempts.filter(({ status }) => status === 'fulfilled')).toHaveLength(6)
    expect(attempts.filter(({ status }) => status === 'rejected')).toHaveLength(0)
    await expect(
      payload.count({
        collection: 'fallback-origins',
        overrideAccess: true,
        where: { workspace: { equals: workspaceID } },
      }),
    ).resolves.toMatchObject({ totalDocs: 5 })
    await expect(
      registerConsoleFallbackOrigin({
        hostname: 'quota-console.fallback-binding.example',
        payload,
        user,
        workspaceID: String(workspaceID),
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: { hostname: 'quota-console.fallback-binding.example' },
    })
    await expect(
      payload.count({
        collection: 'fallback-origins',
        overrideAccess: true,
        where: { workspace: { equals: workspaceID } },
      }),
    ).resolves.toMatchObject({ totalDocs: 5 })
  })

  it('preserves Community writes without creating managed safety records', async () => {
    process.env.RELAY_EDITION = 'community'
    const communityURL = 'https://community-binding.example/download'
    const communityApp = await payload.create({
      collection: 'apps',
      data: {
        androidPackageName: 'com.linksetgo.communitybinding',
        androidSha256CertFingerprints: [androidFingerprint],
        fallbackUrl: communityURL,
        name: 'Community Binding App',
        nativeScheme: 'communitybinding',
        routingMode: 'scheme-handoff',
        slug: 'community-binding-app',
        status: 'active',
        workspace: workspaceID,
      },
      depth: 0,
      overrideAccess: false,
      user,
    })
    expect(communityApp.fallbackUrl).toBe(communityURL)
    await expect(assessmentCount(communityURL)).resolves.toBe(0)
    await payload.delete({
      collection: 'apps',
      id: communityApp.id,
      overrideAccess: true,
    })
    process.env.RELAY_EDITION = 'cloud'
  })
})
