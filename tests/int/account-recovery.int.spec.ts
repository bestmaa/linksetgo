// @vitest-environment node

import config from '@/payload.config'
import {
  requestCloudPasswordReset,
  resetCloudPassword,
  type PasswordResetDelivery,
} from '@/lib/server/account-recovery-service'
import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const FIXTURE = {
  email: 'account-recovery-active@relay.test',
  originalPassword: 'OriginalRecovery123!',
  resetPassword: 'UpdatedRecovery456!',
  unknownEmail: 'account-recovery-unknown@relay.test',
} as const
const originalRelayEdition = process.env.RELAY_EDITION

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
        collection: 'users',
        overrideAccess: true,
        where: { email: { equals: FIXTURE.email } },
      })
    } finally {
      await payload?.destroy()
      if (originalRelayEdition === undefined) delete process.env.RELAY_EDITION
      else process.env.RELAY_EDITION = originalRelayEdition
    }
  })

  it('does not reveal unknown account state and does not attempt delivery', async () => {
    let deliveries = 0
    await expect(
      requestCloudPasswordReset({
        appBaseURL: 'https://app.relay.test',
        email: FIXTURE.unknownEmail,
        payload: payload!,
        sendReset: async () => {
          deliveries += 1
        },
      }),
    ).resolves.toEqual({ deliveryAttempted: false })
    expect(deliveries).toBe(0)
  })

  it('rolls back the reset state when delivery fails', async () => {
    await expect(
      requestCloudPasswordReset({
        appBaseURL: 'https://app.relay.test',
        email: FIXTURE.email,
        payload: payload!,
        sendReset: async () => {
          throw new Error('Simulated delivery outage')
        },
      }),
    ).rejects.toThrow('Simulated delivery outage')

    const users = await payload!.find({
      collection: 'users',
      limit: 1,
      overrideAccess: true,
      pagination: false,
      showHiddenFields: true,
      where: { email: { equals: FIXTURE.email } },
    })
    expect(users.docs[0]?.resetPasswordToken).toBeNull()
    expect(users.docs[0]?.resetPasswordExpiration).toBeNull()
  })

  it('uses a fragment-only one-time Payload reset token and consumes it', async () => {
    let delivery: PasswordResetDelivery | undefined
    await expect(
      requestCloudPasswordReset({
        appBaseURL: 'https://app.relay.test',
        email: FIXTURE.email,
        payload: payload!,
        sendReset: async (value) => {
          delivery = value
        },
      }),
    ).resolves.toEqual({ deliveryAttempted: true })

    const resetURL = new URL(delivery!.resetURL)
    const token = new URLSearchParams(resetURL.hash.slice(1)).get('token')
    expect(resetURL.origin).toBe('https://app.relay.test')
    expect(resetURL.pathname).toBe('/reset-password')
    expect(resetURL.search).toBe('')
    expect(token).toMatch(/^[a-f0-9]{40}$/)

    await resetCloudPassword({
      password: FIXTURE.resetPassword,
      payload: payload!,
      token: token!,
    })
    await expect(
      payload!.login({
        collection: 'users',
        data: { email: FIXTURE.email, password: FIXTURE.resetPassword },
      }),
    ).resolves.toMatchObject({ user: { email: FIXTURE.email } })
    await expect(
      resetCloudPassword({
        password: 'AnotherRecovery789!',
        payload: payload!,
        token: token!,
      }),
    ).rejects.toBeDefined()
  })
})
