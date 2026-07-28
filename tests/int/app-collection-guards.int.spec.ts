import config from '@/payload.config'
import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const FIXTURE = {
  activeSlug: 'app-guard-active',
  draftSlug: 'app-guard-draft',
  identitySlug: 'app-guard-identity',
  organizationSlug: 'app-guard-organization',
  workspaceSlug: 'app-guard-workspace',
} as const

const assertTestDatabase = (): void => {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is required for integration tests.')
  const databaseName = decodeURIComponent(new URL(connectionString).pathname.slice(1))
  if (!databaseName.endsWith('_test')) {
    throw new Error(`Refusing to run integration cleanup against "${databaseName}".`)
  }
}

describe.sequential('Apps collection lifecycle guards', () => {
  let payload: Payload | undefined
  let workspaceID: number

  const cleanup = async (): Promise<void> => {
    if (!payload) return
    await payload.delete({
      collection: 'apps',
      overrideAccess: true,
      where: {
        slug: {
          in: [FIXTURE.activeSlug, FIXTURE.draftSlug, FIXTURE.identitySlug],
        },
      },
    })
    await payload.delete({
      collection: 'workspaces',
      overrideAccess: true,
      where: { slug: { equals: FIXTURE.workspaceSlug } },
    })
    await payload.delete({
      collection: 'organizations',
      overrideAccess: true,
      where: { slug: { equals: FIXTURE.organizationSlug } },
    })
  }

  beforeAll(async () => {
    assertTestDatabase()
    payload = await getPayload({ config: await config })
    await cleanup()
    const organization = await payload.create({
      collection: 'organizations',
      overrideAccess: true,
      data: {
        name: 'App guard organization',
        slug: FIXTURE.organizationSlug,
        status: 'active',
      },
    })
    const workspace = await payload.create({
      collection: 'workspaces',
      overrideAccess: true,
      data: {
        name: 'App guard workspace',
        organization: organization.id,
        slug: FIXTURE.workspaceSlug,
        status: 'active',
      },
    })
    workspaceID = workspace.id
  })

  afterAll(async () => {
    if (!payload) return
    try {
      await cleanup()
    } finally {
      await payload.destroy()
    }
  })

  it('rejects a forged direct active create without a complete platform', async () => {
    await expect(
      payload!.create({
        collection: 'apps',
        overrideAccess: true,
        data: {
          fallbackUrl: 'https://example.com/download',
          name: 'Forged active app',
          slug: FIXTURE.activeSlug,
          status: 'active',
          workspace: workspaceID,
        },
      }),
    ).rejects.toThrow(/complete either the iOS or Android/i)
  })

  it('rejects a forged direct activation while allowing draft and pause', async () => {
    const draft = await payload!.create({
      collection: 'apps',
      overrideAccess: true,
      data: {
        fallbackUrl: 'https://example.com/download',
        name: 'Draft app',
        slug: FIXTURE.draftSlug,
        status: 'draft',
        workspace: workspaceID,
      },
    })

    await expect(
      payload!.update({
        collection: 'apps',
        id: draft.id,
        overrideAccess: true,
        data: { status: 'active' },
      }),
    ).rejects.toThrow(/complete either the iOS or Android/i)
    await expect(
      payload!.update({
        collection: 'apps',
        id: draft.id,
        overrideAccess: true,
        data: { status: 'paused' },
      }),
    ).resolves.toMatchObject({ status: 'paused' })
  })

  it('keeps app key and workspace permanent on privileged direct updates', async () => {
    const app = await payload!.create({
      collection: 'apps',
      overrideAccess: true,
      data: {
        fallbackUrl: 'https://example.com/download',
        name: 'Permanent identity app',
        slug: FIXTURE.identitySlug,
        status: 'draft',
        workspace: workspaceID,
      },
    })

    await expect(
      payload!.update({
        collection: 'apps',
        id: app.id,
        overrideAccess: true,
        data: { slug: 'forged-app-key' },
      }),
    ).rejects.toThrow(/key and workspace are permanent/i)
    await expect(
      payload!.update({
        collection: 'apps',
        id: app.id,
        overrideAccess: true,
        data: { workspace: null },
      }),
    ).rejects.toThrow(/key and workspace are permanent/i)
  })

  it('allows a direct active create when one platform is complete', async () => {
    await expect(
      payload!.create({
        collection: 'apps',
        overrideAccess: true,
        data: {
          fallbackUrl: 'https://example.com/download',
          iosBundleId: 'com.example.appguard',
          iosTeamId: 'A1B2C3D4E5',
          name: 'Ready active app',
          slug: FIXTURE.activeSlug,
          status: 'active',
          workspace: workspaceID,
        },
      }),
    ).resolves.toMatchObject({ status: 'active' })
  })
})
