import type { Payload } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { App, DeepLink, User } from '@/payload-types'

const state = vi.hoisted(() => ({
  apps: [] as App[],
  links: [] as DeepLink[],
  nextAppId: 1,
  nextLinkId: 100,
}))

vi.mock('payload', async (importOriginal) => {
  const actual = await importOriginal<typeof import('payload')>()
  return {
    ...actual,
    commitTransaction: async () => undefined,
    createLocalReq: async (options: { user: User }, payload: Payload) => ({
      payload,
      user: options.user,
    }),
    initTransaction: async () => true,
    killTransaction: async () => undefined,
  }
})

vi.mock('@/lib/server/env', () => ({
  getServerEnvironment: () => ({
    eventHashSecret: 'brand-safety-test-secret-with-at-least-32-characters',
    sharedLinkBaseURL: 'https://go.linksetgo.test',
  }),
}))

vi.mock('@/lib/server/fallback-url-safety-service', () => ({
  findReadyFallbackURL: async () => null,
}))

vi.mock('@/lib/server/postgres-lock', () => ({
  acquireTransactionLock: async () => undefined,
}))

vi.mock('@/lib/server/tenant-context', () => ({
  canAccessWorkspace: async () => true,
}))

import { createQuickLink } from '@/lib/server/quick-link-service'

const timestamp = '2026-07-30T00:00:00.000Z'

const user = (id: number): User =>
  ({
    createdAt: timestamp,
    email: `owner-${id}@example.test`,
    id,
    name: `Owner ${id}`,
    role: 'viewer',
    status: 'active',
    updatedAt: timestamp,
  }) as User

const relationship = (value: unknown): string =>
  typeof value === 'number' || typeof value === 'string' ? String(value) : ''

const equalsFromWhere = (where: unknown, field: string): unknown => {
  if (typeof where !== 'object' || where === null || Array.isArray(where)) return undefined
  const condition = (where as Record<string, unknown>)[field]
  if (typeof condition !== 'object' || condition === null || Array.isArray(condition)) {
    return undefined
  }
  return (condition as Record<string, unknown>).equals
}

const payload = (): Payload =>
  ({
    create: vi.fn(async (input: { collection: string; data: Record<string, unknown> }) => {
      if (input.collection === 'apps') {
        const app = {
          ...input.data,
          createdAt: timestamp,
          id: state.nextAppId++,
          updatedAt: timestamp,
        } as App
        state.apps.push(app)
        return app
      }
      if (input.collection === 'deep-links') {
        const link = {
          ...input.data,
          createdAt: timestamp,
          id: state.nextLinkId++,
          updatedAt: timestamp,
        } as DeepLink
        state.links.push(link)
        return link
      }
      throw new Error(`Unexpected create collection: ${input.collection}`)
    }),
    find: vi.fn(async (input: { collection: string; where: unknown }) => {
      if (input.collection === 'apps') {
        const workspace = equalsFromWhere(input.where, 'workspace')
        const publicKey = equalsFromWhere(input.where, 'publicKey')
        return {
          docs: state.apps.filter(
            (app) =>
              (workspace === undefined ||
                relationship(app.workspace) === relationship(workspace)) &&
              (publicKey === undefined || app.publicKey === publicKey),
          ),
        }
      }
      if (input.collection === 'deep-links') return { docs: [] }
      throw new Error(`Unexpected find collection: ${input.collection}`)
    }),
    update: vi.fn(async (input: { data: Record<string, unknown>; id: number | string }) => {
      const index = state.apps.findIndex((app) => String(app.id) === String(input.id))
      const current = state.apps[index]
      if (!current) throw new Error('App update target was not found.')
      const updated = { ...current, ...input.data, updatedAt: timestamp } as App
      state.apps[index] = updated
      return updated
    }),
  }) as unknown as Payload

const quickLinkData = (nativeScheme: string, workspaceId: string) => ({
  appStoreUrl: null,
  fallbackUrl: null,
  name: null,
  nativeUrl: `${nativeScheme}://home`,
  playStoreUrl: null,
  workspaceId,
})

describe('quick-link brand-squatting protection', () => {
  beforeEach(() => {
    state.apps.length = 0
    state.links.length = 0
    state.nextAppId = 1
    state.nextLinkId = 100
  })

  it('tenant-scopes concurrent Oberoi and PayPal app claims without trusting their names', async () => {
    const database = payload()
    const claims = [
      { nativeScheme: 'oberoi', userId: 1, workspaceId: '101' },
      { nativeScheme: 'oberoi', userId: 2, workspaceId: '202' },
      { nativeScheme: 'paypal', userId: 3, workspaceId: '303' },
      { nativeScheme: 'paypal', userId: 4, workspaceId: '404' },
    ]
    const results = await Promise.all(
      claims.map((claim) =>
        createQuickLink({
          data: quickLinkData(claim.nativeScheme, claim.workspaceId),
          payload: database,
          user: user(claim.userId),
        }),
      ),
    )

    expect(results.every((result) => result.ok)).toBe(true)
    const keys = results.flatMap((result) => (result.ok ? [result.value.appKey] : []))
    expect(new Set(keys).size).toBe(claims.length)
    claims.forEach((claim, index) => {
      expect(keys[index]).toMatch(new RegExp(`^${claim.nativeScheme}-[a-f0-9]{24}$`))
      expect(keys[index]).not.toBe(claim.nativeScheme)
    })
    expect(state.apps).toHaveLength(claims.length)
    expect(state.apps.every((app) => app.name === 'Mobile app')).toBe(true)
  })

  it('preserves a previously assigned exact alias from an explicit admin workflow', async () => {
    state.apps.push({
      createdAt: timestamp,
      id: 900,
      name: 'Verified PayPal',
      nativeScheme: 'paypal',
      publicKey: 'paypal',
      routingMode: 'verified-app-links',
      slug: 'paypal',
      status: 'active',
      updatedAt: timestamp,
      workspace: 505,
    } as App)

    const result = await createQuickLink({
      data: quickLinkData('paypal', '505'),
      payload: payload(),
      user: user(5),
    })

    expect(result).toMatchObject({
      ok: true,
      value: {
        appKey: 'paypal',
        publicUrl: 'https://go.linksetgo.test/paypal/home',
      },
    })
    expect(state.apps[0]).toMatchObject({
      name: 'Verified PayPal',
      publicKey: 'paypal',
      routingMode: 'verified-app-links',
    })
  })
})
