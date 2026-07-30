import type { Payload } from 'payload'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const transaction = vi.hoisted(() => ({
  events: [] as string[],
}))

vi.mock('payload', async (importOriginal) => {
  const actual = await importOriginal<typeof import('payload')>()
  return {
    ...actual,
    commitTransaction: async () => {
      transaction.events.push('commit')
    },
    createLocalReq: async (_options: unknown, payload: Payload) => ({ payload }),
    initTransaction: async () => true,
    killTransaction: async () => {
      transaction.events.push('rollback')
    },
  }
})

vi.mock('@/lib/server/postgres-lock', () => ({
  acquireTransactionLock: async () => {
    transaction.events.push('lock')
  },
}))

import { createCloudSignup, resendCloudSignupVerification } from '@/lib/server/cloud-signup-service'

const originalEdition = process.env.RELAY_EDITION
const originalSignupEnabled = process.env.CLOUD_SIGNUP_ENABLED

const user = {
  createdAt: '2026-07-30T00:00:00.000Z',
  email: 'owner@example.test',
  emailVerificationExpiresAt: '2026-07-31T00:00:00.000Z',
  emailVerificationTokenHash: 'a'.repeat(64),
  id: 11,
  name: 'Example Owner',
  status: 'pending-verification',
  updatedAt: '2026-07-30T00:00:00.000Z',
}

beforeEach(() => {
  process.env.RELAY_EDITION = 'cloud'
  process.env.CLOUD_SIGNUP_ENABLED = 'true'
  transaction.events.length = 0
})

afterEach(() => {
  if (originalEdition === undefined) delete process.env.RELAY_EDITION
  else process.env.RELAY_EDITION = originalEdition
  if (originalSignupEnabled === undefined) delete process.env.CLOUD_SIGNUP_ENABLED
  else process.env.CLOUD_SIGNUP_ENABLED = originalSignupEnabled
})

describe('Cloud signup email transaction ordering', () => {
  it('handles a duplicate email before the matching workspace collision', async () => {
    const find = vi
      .fn()
      .mockResolvedValueOnce({ docs: [{ id: 1, role: 'super-admin', status: 'active' }] })
      .mockResolvedValueOnce({ docs: [user] })
    const payload = { find } as unknown as Payload

    await expect(
      createCloudSignup(
        {
          acceptTerms: true,
          email: user.email,
          name: user.name,
          organizationName: 'Example Organization',
          password: 'StrongPassword123!',
          workspaceSlug: 'taken-workspace',
        },
        {
          appBaseURL: 'https://app.linksetgo.test',
          payload,
          randomToken: () => 'b'.repeat(43),
          sendVerification: async () => undefined,
        },
      ),
    ).rejects.toMatchObject({ code: 'EMAIL_UNAVAILABLE' })

    expect(find).toHaveBeenCalledTimes(2)
    expect(transaction.events).toEqual(['lock', 'lock', 'lock', 'rollback'])
  })

  it('queues the initial verification in the same transaction as the pending graph', async () => {
    const find = vi
      .fn()
      .mockResolvedValueOnce({ docs: [{ id: 1, role: 'super-admin', status: 'active' }] })
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [] })
    const payload = {
      create: vi.fn(async ({ collection }: { collection: string }) => {
        transaction.events.push(`create:${collection}`)
        if (collection === 'users') return user
        if (collection === 'organizations') return { id: 21 }
        if (collection === 'workspaces') return { id: 31 }
        return { id: 41 }
      }),
      find,
    } as unknown as Payload

    await expect(
      createCloudSignup(
        {
          acceptTerms: true,
          email: user.email,
          name: user.name,
          organizationName: 'Example Organization',
          password: 'StrongPassword123!',
          workspaceSlug: 'example-organization',
        },
        {
          appBaseURL: 'https://app.linksetgo.test',
          now: () => new Date('2026-07-30T00:00:00.000Z'),
          payload,
          randomToken: () => 'b'.repeat(43),
          queueVerification: async () => {
            transaction.events.push('outbox-write')
          },
        },
      ),
    ).resolves.toMatchObject({ email: user.email })

    expect(transaction.events).toEqual([
      'lock',
      'lock',
      'create:users',
      'create:organizations',
      'create:workspaces',
      'create:organization-memberships',
      'outbox-write',
      'commit',
    ])
  })

  it('queues a rotated resend token in the same transaction', async () => {
    const payload = {
      find: vi
        .fn()
        .mockResolvedValueOnce({ docs: [user] })
        .mockResolvedValueOnce({ docs: [user] })
        .mockResolvedValueOnce({
          docs: [
            {
              id: 41,
              organization: 21,
              role: 'owner',
              status: 'disabled',
              user: user.id,
            },
          ],
        })
        .mockResolvedValueOnce({
          docs: [{ id: 31, platformSuspended: false, status: 'pending-verification' }],
        }),
      update: vi.fn(async () => {
        transaction.events.push('token-rotated')
        return { docs: [user] }
      }),
    } as unknown as Payload

    await expect(
      resendCloudSignupVerification(user.email, {
        appBaseURL: 'https://app.linksetgo.test',
        now: () => new Date('2026-07-30T01:00:00.000Z'),
        payload,
        queueVerification: async () => {
          transaction.events.push('outbox-write')
        },
        randomToken: () => 'c'.repeat(43),
      }),
    ).resolves.toEqual({ deliveryAttempted: true })

    expect(transaction.events).toEqual(['lock', 'token-rotated', 'outbox-write', 'commit'])
  })
})
