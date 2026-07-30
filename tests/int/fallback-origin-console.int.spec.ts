import config from '@/payload.config'
import {
  getConsoleFallbackOriginInstructions,
  listConsoleFallbackOrigins,
  registerConsoleFallbackOrigin,
  runConsoleFallbackOriginAction,
} from '@/lib/server/fallback-origin-console'
import type { FallbackOriginDNSProviderConfiguration } from '@/lib/server/fallback-origin-dns-webhook'
import { MEMBERSHIP_OWNER_OVERRIDE_CONTEXT } from '@/lib/server/membership-owner-guards'
import type { User } from '@/payload-types'
import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const FIXTURE = {
  foreignHostname: 'foreign-console-fallback.example',
  hostname: 'console-fallback.example',
  organizationA: 'fallback-console-org-a',
  organizationB: 'fallback-console-org-b',
  systemUser: 'fallback-console-system@linksetgo.test',
  userA: 'fallback-console-a@linksetgo.test',
  userB: 'fallback-console-b@linksetgo.test',
  workspaceA: 'fallback-console-workspace-a',
  workspaceB: 'fallback-console-workspace-b',
} as const
const previousEdition = process.env.RELAY_EDITION

const unavailableProvider: FallbackOriginDNSProviderConfiguration = {
  available: false,
  message: 'Trusted TXT lookup is not configured.',
  provider: null,
}

const assertTestDatabase = (): void => {
  const value = process.env.DATABASE_URL
  if (!value) throw new Error('DATABASE_URL is required for integration tests.')
  const name = decodeURIComponent(new URL(value).pathname.slice(1))
  if (!name.endsWith('_test')) throw new Error(`Refusing test cleanup against "${name}".`)
}

describe.sequential('workspace fallback-origin console', () => {
  let payload: Payload | undefined
  let userA: User
  let userB: User
  let workspaceAID: number
  let workspaceBID: number
  let originID: string

  const cleanup = async (): Promise<void> => {
    if (!payload) return
    await payload.delete({
      collection: 'fallback-origins',
      overrideAccess: true,
      where: { hostname: { in: [FIXTURE.hostname, FIXTURE.foreignHostname] } },
    })
    const organizations = await payload.find({
      collection: 'organizations',
      depth: 0,
      limit: 10,
      overrideAccess: true,
      pagination: false,
      where: { slug: { in: [FIXTURE.organizationA, FIXTURE.organizationB] } },
    })
    const organizationIDs = organizations.docs.map(({ id }) => id)
    if (organizationIDs.length) {
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
      where: { email: { in: [FIXTURE.systemUser, FIXTURE.userA, FIXTURE.userB] } },
    })
  }

  beforeAll(async () => {
    assertTestDatabase()
    process.env.RELAY_EDITION = 'cloud'
    payload = await getPayload({ config: await config })
    await cleanup()
    await payload.create({
      collection: 'users',
      data: {
        email: FIXTURE.systemUser,
        name: 'Fallback Console System',
        password: 'FallbackConsoleSystem123!',
        role: 'super-admin',
        status: 'active',
      },
      overrideAccess: true,
    })
    userA = await payload.create({
      collection: 'users',
      data: {
        email: FIXTURE.userA,
        name: 'Fallback Console A',
        password: 'FallbackConsoleA123!',
        role: 'admin',
        status: 'active',
      },
      overrideAccess: true,
    })
    userB = await payload.create({
      collection: 'users',
      data: {
        email: FIXTURE.userB,
        name: 'Fallback Console B',
        password: 'FallbackConsoleB123!',
        role: 'admin',
        status: 'active',
      },
      overrideAccess: true,
    })
    const organizationA = await payload.create({
      collection: 'organizations',
      data: { name: 'Fallback Console A', slug: FIXTURE.organizationA, status: 'active' },
      overrideAccess: true,
    })
    const organizationB = await payload.create({
      collection: 'organizations',
      data: { name: 'Fallback Console B', slug: FIXTURE.organizationB, status: 'active' },
      overrideAccess: true,
    })
    const workspaceA = await payload.create({
      collection: 'workspaces',
      data: {
        name: 'Fallback Console A',
        organization: organizationA.id,
        slug: FIXTURE.workspaceA,
        status: 'active',
      },
      overrideAccess: true,
    })
    const workspaceB = await payload.create({
      collection: 'workspaces',
      data: {
        name: 'Fallback Console B',
        organization: organizationB.id,
        slug: FIXTURE.workspaceB,
        status: 'active',
      },
      overrideAccess: true,
    })
    workspaceAID = workspaceA.id
    workspaceBID = workspaceB.id
    await Promise.all([
      payload.create({
        collection: 'organization-memberships',
        data: {
          organization: organizationA.id,
          role: 'owner',
          status: 'active',
          user: userA.id,
        },
        overrideAccess: true,
      }),
      payload.create({
        collection: 'organization-memberships',
        data: {
          organization: organizationB.id,
          role: 'owner',
          status: 'active',
          user: userB.id,
        },
        overrideAccess: true,
      }),
    ])
  })

  afterAll(async () => {
    try {
      await cleanup()
    } finally {
      await payload?.destroy()
      if (previousEdition === undefined) delete process.env.RELAY_EDITION
      else process.env.RELAY_EDITION = previousEdition
    }
  })

  it('registers only in a workspace the actor can manage', async () => {
    await expect(
      registerConsoleFallbackOrigin({
        hostname: FIXTURE.foreignHostname,
        payload: payload!,
        user: userA,
        workspaceID: String(workspaceBID),
      }),
    ).resolves.toMatchObject({ code: 'FORBIDDEN', ok: false, status: 403 })

    const result = await registerConsoleFallbackOrigin({
      hostname: FIXTURE.hostname,
      payload: payload!,
      user: userA,
      workspaceID: String(workspaceAID),
    })
    expect(result).toMatchObject({
      ok: true,
      value: { hostname: FIXTURE.hostname, status: 'pending' },
    })
    if (!result.ok) throw new Error('Fallback-origin registration failed.')
    originID = String(result.value.id)

    await expect(
      registerConsoleFallbackOrigin({
        hostname: FIXTURE.hostname,
        payload: payload!,
        user: userB,
        workspaceID: String(workspaceBID),
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: { hostname: FIXTURE.hostname, status: 'pending' },
    })
    const independentOrigins = await payload!.find({
      collection: 'fallback-origins',
      depth: 0,
      limit: 3,
      overrideAccess: true,
      pagination: false,
      where: { hostname: { equals: FIXTURE.hostname } },
    })
    expect(independentOrigins.docs).toHaveLength(2)
    expect(
      new Set(independentOrigins.docs.map(({ verificationToken }) => verificationToken)).size,
    ).toBe(2)
  })

  it('lists and reveals TXT instructions only inside the selected workspace', async () => {
    await expect(
      listConsoleFallbackOrigins({
        payload: payload!,
        provider: unavailableProvider,
        user: userA,
        workspaceID: String(workspaceAID),
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        docs: [{ hostname: FIXTURE.hostname }],
        required: true,
        verification: { available: false },
      },
    })
    await expect(
      getConsoleFallbackOriginInstructions({
        id: originID,
        payload: payload!,
        user: userB,
        workspaceID: String(workspaceBID),
      }),
    ).resolves.toMatchObject({ code: 'NOT_FOUND', ok: false, status: 404 })

    const instructions = await getConsoleFallbackOriginInstructions({
      id: originID,
      payload: payload!,
      user: userA,
      workspaceID: String(workspaceAID),
    })
    expect(instructions).toMatchObject({
      ok: true,
      value: {
        record: {
          name: `_linksetgo-fallback.${FIXTURE.hostname}`,
          type: 'TXT',
          value: expect.stringMatching(/^linksetgo-fallback-verification=/),
        },
      },
    })
  })

  it('fails closed without a provider, then verifies exact evidence and revokes', async () => {
    await expect(
      runConsoleFallbackOriginAction({
        action: 'verify',
        id: originID,
        payload: payload!,
        provider: unavailableProvider,
        user: userA,
        workspaceID: String(workspaceAID),
      }),
    ).resolves.toMatchObject({ code: 'UNAVAILABLE', ok: false, status: 503 })
    const pending = await payload!.findByID({
      collection: 'fallback-origins',
      id: Number(originID),
      overrideAccess: true,
    })
    expect(pending.status).toBe('pending')

    await expect(
      runConsoleFallbackOriginAction({
        action: 'verify',
        id: originID,
        payload: payload!,
        provider: {
          available: true,
          provider: {
            lookupTXT: async () => {
              throw new Error('provider network details')
            },
          },
        },
        user: userA,
        workspaceID: String(workspaceAID),
      }),
    ).resolves.toMatchObject({ code: 'VERIFICATION_FAILED', ok: false, status: 503 })
    await expect(
      payload!.findByID({
        collection: 'fallback-origins',
        id: Number(originID),
        overrideAccess: true,
      }),
    ).resolves.toMatchObject({ status: 'pending' })

    const instructions = await getConsoleFallbackOriginInstructions({
      id: originID,
      payload: payload!,
      user: userA,
      workspaceID: String(workspaceAID),
    })
    if (!instructions.ok) throw new Error('Fallback-origin instructions unavailable.')
    const lookups: string[] = []
    const provider: FallbackOriginDNSProviderConfiguration = {
      available: true,
      provider: {
        lookupTXT: async (recordName) => {
          lookups.push(recordName)
          return {
            observedAt: '2026-07-27T08:30:00.000Z',
            values: [instructions.value.record.value],
          }
        },
      },
    }
    await expect(
      runConsoleFallbackOriginAction({
        action: 'verify',
        id: originID,
        payload: payload!,
        provider,
        user: userA,
        workspaceID: String(workspaceAID),
      }),
    ).resolves.toMatchObject({ ok: true, value: { origin: { status: 'verified' } } })
    expect(lookups).toEqual([instructions.value.record.name])

    await expect(
      runConsoleFallbackOriginAction({
        action: 'revoke',
        id: originID,
        payload: payload!,
        provider: unavailableProvider,
        user: userA,
        workspaceID: String(workspaceAID),
      }),
    ).resolves.toMatchObject({ ok: true, value: { origin: { status: 'revoked' } } })
  })

  it('keeps Community behavior explicit and verification-free', async () => {
    process.env.RELAY_EDITION = 'community'
    try {
      await expect(
        listConsoleFallbackOrigins({
          payload: payload!,
          provider: unavailableProvider,
          user: userA,
          workspaceID: String(workspaceAID),
        }),
      ).resolves.toEqual({
        ok: true,
        value: {
          docs: [],
          required: false,
          verification: { available: false, message: null },
        },
      })
    } finally {
      process.env.RELAY_EDITION = 'cloud'
    }
  })
})
