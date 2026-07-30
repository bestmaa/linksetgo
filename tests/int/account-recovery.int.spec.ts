// @vitest-environment node

import config from '@/payload.config'
import {
  hashPasswordResetToken,
  requestCloudPasswordReset,
  resetCloudPassword,
  type PasswordResetDelivery,
} from '@/lib/server/account-recovery-service'
import { decryptCloudAccountEmailDelivery } from '@/lib/server/cloud-account-email-outbox'
import { CLOUD_ACCOUNT_EMAIL_OUTBOX_QUEUE } from '@/lib/server/cloud-account-email-task'
import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const FIXTURE = {
  email: 'account-recovery-active@linksetgo.test',
  originalPassword: 'OriginalRecovery123!',
  resetPassword: 'UpdatedRecovery456!',
  unknownEmail: 'account-recovery-unknown@linksetgo.test',
} as const
const eventHashSecret = 'account-recovery-integration-secret-at-least-32-characters'
const originalLinksetGoEdition = process.env.RELAY_EDITION

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const assertTestDatabase = (): void => {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is required for integration tests.')
  const databaseName = decodeURIComponent(new URL(connectionString).pathname.slice(1))
  if (!databaseName.endsWith('_test')) {
    throw new Error(`Refusing to run integration cleanup against "${databaseName}".`)
  }
}

describe.sequential('Relay Cloud account recovery', () => {
  let payload: Payload | undefined

  beforeAll(async () => {
    assertTestDatabase()
    process.env.RELAY_EDITION = 'cloud'
    payload = await getPayload({ config: await config })
    await payload.delete({
      collection: 'payload-jobs',
      overrideAccess: true,
      where: { queue: { equals: CLOUD_ACCOUNT_EMAIL_OUTBOX_QUEUE } },
    })
    await payload.delete({
      collection: 'users',
      overrideAccess: true,
      where: { email: { equals: FIXTURE.email } },
    })
    await payload.create({
      collection: 'users',
      data: {
        email: FIXTURE.email,
        name: 'Account Recovery Owner',
        password: FIXTURE.originalPassword,
        role: 'viewer',
        status: 'active',
      },
      overrideAccess: true,
    })
  })

  afterAll(async () => {
    try {
      await payload?.delete({
        collection: 'payload-jobs',
        overrideAccess: true,
        where: { queue: { equals: CLOUD_ACCOUNT_EMAIL_OUTBOX_QUEUE } },
      })
      await payload?.delete({
        collection: 'users',
        overrideAccess: true,
        where: { email: { equals: FIXTURE.email } },
      })
    } finally {
      await payload?.destroy()
      if (originalLinksetGoEdition === undefined) delete process.env.RELAY_EDITION
      else process.env.RELAY_EDITION = originalLinksetGoEdition
    }
  })

  it('does not reveal unknown account state and does not queue delivery', async () => {
    let deliveries = 0
    await expect(
      requestCloudPasswordReset({
        appBaseURL: 'https://app.linksetgo.test',
        email: FIXTURE.unknownEmail,
        eventHashSecret,
        payload: payload!,
        queueReset: async () => {
          deliveries += 1
        },
      }),
    ).resolves.toEqual({ deliveryAttempted: false })
    expect(deliveries).toBe(0)
  })

  it('persists only an HMAC token digest before committing its delivery job', async () => {
    const token = 'B'.repeat(43)
    await expect(
      requestCloudPasswordReset({
        appBaseURL: 'https://app.linksetgo.test',
        email: FIXTURE.email,
        eventHashSecret,
        payload: payload!,
        randomToken: () => token,
      }),
    ).resolves.toEqual({ deliveryAttempted: true })

    const users = await payload!.find({
      collection: 'users',
      limit: 1,
      overrideAccess: true,
      pagination: false,
      showHiddenFields: true,
      where: { email: { equals: FIXTURE.email } },
    })
    expect(users.docs[0]?.passwordResetTokenHash).toBe(
      hashPasswordResetToken(token, eventHashSecret),
    )
    expect(users.docs[0]?.passwordResetTokenHash).not.toContain(token)
    expect(Date.parse(users.docs[0]?.passwordResetExpiresAt ?? '')).toBeGreaterThan(Date.now())
    expect(users.docs[0]?.resetPasswordToken).toBeNull()

    const jobs = await payload!.find({
      collection: 'payload-jobs',
      limit: 1,
      overrideAccess: true,
      pagination: false,
      sort: '-createdAt',
      where: { queue: { equals: CLOUD_ACCOUNT_EMAIL_OUTBOX_QUEUE } },
    })
    const jobInput = jobs.docs[0]?.input
    expect(JSON.stringify(jobInput)).not.toContain(token)
    expect(JSON.stringify(jobInput)).not.toContain(FIXTURE.email)
    if (!isRecord(jobInput) || typeof jobInput.encryptedEnvelope !== 'string') {
      throw new Error('Expected one encrypted account-email job.')
    }
    const queuedDelivery = decryptCloudAccountEmailDelivery(
      jobInput.encryptedEnvelope,
      eventHashSecret,
    )
    expect(queuedDelivery).toMatchObject({
      kind: 'password-reset',
      delivery: { email: FIXTURE.email, resetURL: expect.stringContaining(`#token=${token}`) },
    })
    await payload!.delete({
      collection: 'payload-jobs',
      id: jobs.docs[0]!.id,
      overrideAccess: true,
    })
  })

  it('rejects weak passwords, rolls back safely, and atomically revokes every session', async () => {
    const login = await payload!.login({
      collection: 'users',
      data: { email: FIXTURE.email, password: FIXTURE.originalPassword },
    })
    expect(login.token).toBeTruthy()
    const authHeaders = new Headers({
      authorization: `JWT ${login.token}`,
      disableautologin: 'true',
    })
    await expect(payload!.auth({ headers: authHeaders })).resolves.toMatchObject({
      user: { email: FIXTURE.email },
    })

    const token = 'C'.repeat(43)
    let delivery: PasswordResetDelivery | undefined
    await expect(
      requestCloudPasswordReset({
        appBaseURL: 'https://app.linksetgo.test',
        email: FIXTURE.email,
        eventHashSecret,
        payload: payload!,
        queueReset: async (value) => {
          delivery = value
        },
        randomToken: () => token,
      }),
    ).resolves.toEqual({ deliveryAttempted: true })

    const resetURL = new URL(delivery!.resetURL)
    const deliveredToken = new URLSearchParams(resetURL.hash.slice(1)).get('token')
    expect(resetURL.origin).toBe('https://app.linksetgo.test')
    expect(resetURL.pathname).toBe('/reset-password')
    expect(resetURL.search).toBe('')
    expect(deliveredToken).toBe(token)

    await expect(
      resetCloudPassword({
        eventHashSecret,
        password: 'weak-password',
        payload: payload!,
        token,
      }),
    ).rejects.toThrow('This reset request is invalid.')

    const atomicUpdateFailure = vi
      .spyOn(payload!, 'update')
      .mockRejectedValueOnce(new Error('Simulated atomic update failure'))
    await expect(
      resetCloudPassword({
        eventHashSecret,
        password: FIXTURE.resetPassword,
        payload: payload!,
        token,
      }),
    ).rejects.toThrow('This reset request is invalid.')
    atomicUpdateFailure.mockRestore()

    await expect(payload!.auth({ headers: authHeaders })).resolves.toMatchObject({
      user: { email: FIXTURE.email },
    })
    const afterRollback = await payload!.find({
      collection: 'users',
      limit: 1,
      overrideAccess: true,
      pagination: false,
      showHiddenFields: true,
      where: { email: { equals: FIXTURE.email } },
    })
    expect(afterRollback.docs[0]?.passwordResetTokenHash).toBe(
      hashPasswordResetToken(token, eventHashSecret),
    )
    expect(afterRollback.docs[0]?.sessions?.length).toBeGreaterThan(0)

    await resetCloudPassword({
      eventHashSecret,
      password: FIXTURE.resetPassword,
      payload: payload!,
      token,
    })
    await expect(payload!.auth({ headers: authHeaders })).resolves.toMatchObject({ user: null })
    const afterReset = await payload!.find({
      collection: 'users',
      limit: 1,
      overrideAccess: true,
      pagination: false,
      showHiddenFields: true,
      where: { email: { equals: FIXTURE.email } },
    })
    expect(afterReset.docs[0]?.sessions ?? []).toEqual([])
    expect(afterReset.docs[0]?.passwordResetTokenHash).toBeNull()
    expect(afterReset.docs[0]?.passwordResetExpiresAt).toBeNull()
    await expect(
      payload!.login({
        collection: 'users',
        data: { email: FIXTURE.email, password: FIXTURE.resetPassword },
      }),
    ).resolves.toMatchObject({ user: { email: FIXTURE.email } })
    await expect(
      resetCloudPassword({
        eventHashSecret,
        password: 'AnotherRecovery789!',
        payload: payload!,
        token,
      }),
    ).rejects.toBeDefined()
  })
})
