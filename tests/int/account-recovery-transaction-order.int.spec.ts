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
    createLocalReq: async (_options: unknown, payload: Payload) => ({
      payload,
      transactionID: 'account-recovery-test',
    }),
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

import {
  hashPasswordResetToken,
  requestCloudPasswordReset,
  resetCloudPassword,
} from '@/lib/server/account-recovery-service'

const originalEdition = process.env.RELAY_EDITION
const eventHashSecret = 'account-recovery-test-secret-that-is-long-enough'
const resetToken = 'a'.repeat(43)
const user = {
  createdAt: '2026-07-30T00:00:00.000Z',
  email: 'owner@example.test',
  id: 7,
  name: 'Example Owner',
  passwordResetExpiresAt: '2099-07-30T01:00:00.000Z',
  passwordResetTokenHash: hashPasswordResetToken(resetToken, eventHashSecret),
  status: 'active',
  updatedAt: '2026-07-30T00:00:00.000Z',
}

beforeEach(() => {
  process.env.RELAY_EDITION = 'cloud'
  transaction.events.length = 0
})

afterEach(() => {
  if (originalEdition === undefined) delete process.env.RELAY_EDITION
  else process.env.RELAY_EDITION = originalEdition
})

describe('account email transaction ordering', () => {
  it('stores only the token hash and durably queues delivery before commit', async () => {
    const update = vi.fn(async () => {
      transaction.events.push('token-hash-write')
      return user
    })
    const payload = {
      find: vi.fn(async () => ({ docs: [user] })),
      update,
    } as unknown as Payload

    await expect(
      requestCloudPasswordReset({
        appBaseURL: 'https://app.linksetgo.test',
        email: user.email,
        eventHashSecret,
        payload,
        queueReset: async (delivery) => {
          expect(delivery.resetURL).toContain(`#token=${resetToken}`)
          transaction.events.push('outbox-write')
        },
        randomToken: () => resetToken,
      }),
    ).resolves.toEqual({ deliveryAttempted: true })

    expect(transaction.events).toEqual(['lock', 'token-hash-write', 'outbox-write', 'commit'])
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          passwordResetTokenHash: hashPasswordResetToken(resetToken, eventHashSecret),
          resetPasswordToken: null,
        }),
      }),
    )
    expect(JSON.stringify(update.mock.calls)).not.toContain(resetToken)
  })

  it('rolls back the token hash when durable queue insertion fails', async () => {
    const payload = {
      find: vi.fn(async () => ({ docs: [user] })),
      update: vi.fn(async () => {
        transaction.events.push('token-hash-write')
        return user
      }),
    } as unknown as Payload

    await expect(
      requestCloudPasswordReset({
        appBaseURL: 'https://app.linksetgo.test',
        email: user.email,
        eventHashSecret,
        payload,
        queueReset: async () => {
          transaction.events.push('outbox-write')
          throw new Error('Database detail')
        },
        randomToken: () => resetToken,
      }),
    ).rejects.toThrow('Cloud account recovery could not be requested.')

    expect(transaction.events).toEqual(['lock', 'token-hash-write', 'outbox-write', 'rollback'])
  })

  it('changes the password, consumes the token, and revokes sessions in one update', async () => {
    const update = vi.fn(async () => {
      transaction.events.push('atomic-credential-update')
      return { ...user, sessions: [] }
    })
    const payload = {
      find: vi.fn(async () => ({ docs: [user] })),
      update,
    } as unknown as Payload

    await expect(
      resetCloudPassword({
        eventHashSecret,
        password: 'UpdatedPassword123!',
        payload,
        token: resetToken,
      }),
    ).resolves.toBeUndefined()

    expect(transaction.events).toEqual(['lock', 'atomic-credential-update', 'commit'])
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          password: 'UpdatedPassword123!',
          passwordResetExpiresAt: null,
          passwordResetTokenHash: null,
          sessions: [],
        }),
      }),
    )
  })

  it('rolls back password, token consumption, and session revocation together', async () => {
    const payload = {
      find: vi.fn(async () => ({ docs: [user] })),
      update: vi.fn(async () => {
        transaction.events.push('atomic-credential-update')
        throw new Error('Database detail')
      }),
    } as unknown as Payload

    await expect(
      resetCloudPassword({
        eventHashSecret,
        password: 'UpdatedPassword123!',
        payload,
        token: resetToken,
      }),
    ).rejects.toThrow('This reset request is invalid.')

    expect(transaction.events).toEqual(['lock', 'atomic-credential-update', 'rollback'])
  })
})
