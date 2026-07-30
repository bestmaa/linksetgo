import type { Payload, PayloadRequest } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { waitForNonEnumeratingAccountResponse } from '@/lib/server/account-response-timing'
import {
  decryptCloudAccountEmailDelivery,
  deliverCloudAccountEmail,
  encryptCloudAccountEmailDelivery,
  queueCloudAccountEmailDelivery,
  type CloudAccountEmailDelivery,
} from '@/lib/server/cloud-account-email-outbox'
import {
  CLOUD_ACCOUNT_EMAIL_OUTBOX_QUEUE,
  CLOUD_ACCOUNT_EMAIL_OUTBOX_TASK,
} from '@/lib/server/cloud-account-email-task'

const encryptionSecret = 'cloud-account-email-outbox-test-secret-is-long-enough'
const token = 'D'.repeat(43)
const delivery: CloudAccountEmailDelivery = {
  kind: 'password-reset',
  delivery: {
    email: 'owner@example.test',
    expiresAt: '2099-07-30T01:00:00.000Z',
    name: 'Example Owner',
    resetURL: `https://app.linksetgo.test/reset-password#token=${token}`,
  },
}

describe('cloud account email outbox', () => {
  it('persists only an authenticated encrypted envelope', async () => {
    type QueuedJob = {
      input: { encryptedEnvelope: string; expiresAt: string }
      queue: string
      req: PayloadRequest
      task: string
    }
    const queue = vi.fn(async (_job: QueuedJob) => ({ id: 1 }))
    const payload = { jobs: { queue } } as unknown as Payload
    const req = {
      payload,
      transactionID: 'outbox-test-transaction',
    } as unknown as PayloadRequest

    await queueCloudAccountEmailDelivery({
      delivery,
      encryptionSecret,
      payload,
      req,
    })

    const queued = queue.mock.calls[0]?.[0]
    expect(queued).toMatchObject({
      queue: CLOUD_ACCOUNT_EMAIL_OUTBOX_QUEUE,
      req,
      task: CLOUD_ACCOUNT_EMAIL_OUTBOX_TASK,
    })
    const serializedInput = JSON.stringify(queued?.input)
    expect(serializedInput).not.toContain(token)
    expect(serializedInput).not.toContain(delivery.delivery.email)
    expect(
      decryptCloudAccountEmailDelivery(String(queued?.input.encryptedEnvelope), encryptionSecret),
    ).toEqual(delivery)
  })

  it('rejects tampered ciphertext and the wrong encryption key', () => {
    const encrypted = encryptCloudAccountEmailDelivery(delivery, encryptionSecret)
    expect(() =>
      decryptCloudAccountEmailDelivery(`${encrypted.slice(0, -1)}A`, encryptionSecret),
    ).toThrow('Cloud email outbox envelope is invalid.')
    expect(() =>
      decryptCloudAccountEmailDelivery(
        encrypted,
        'different-cloud-account-email-outbox-secret-is-long-enough',
      ),
    ).toThrow('Cloud email outbox envelope is invalid.')
  })

  it('delivers valid queued mail and silently consumes expired jobs', async () => {
    const encryptedEnvelope = encryptCloudAccountEmailDelivery(delivery, encryptionSecret)
    const sendPasswordReset = vi.fn(async () => undefined)
    const sendVerification = vi.fn(async () => undefined)

    await expect(
      deliverCloudAccountEmail(
        { encryptedEnvelope, expiresAt: delivery.delivery.expiresAt },
        encryptionSecret,
        {
          now: () => new Date('2026-07-30T00:00:00.000Z'),
          sendPasswordReset,
          sendVerification,
        },
      ),
    ).resolves.toBe(true)
    expect(sendPasswordReset).toHaveBeenCalledWith(delivery.delivery)
    expect(sendVerification).not.toHaveBeenCalled()

    await expect(
      deliverCloudAccountEmail(
        { encryptedEnvelope, expiresAt: delivery.delivery.expiresAt },
        encryptionSecret,
        {
          now: () => new Date('2100-07-30T00:00:00.000Z'),
          sendPasswordReset,
          sendVerification,
        },
      ),
    ).resolves.toBe(false)
    expect(sendPasswordReset).toHaveBeenCalledTimes(1)
  })
})

describe('non-enumerating account response timing', () => {
  it('applies one common bounded floor and jitter', async () => {
    const sleep = vi.fn(async () => undefined)
    await waitForNonEnumeratingAccountResponse(1_000, {
      jitter: () => 75,
      minimumMilliseconds: 400,
      now: () => 1_125,
      sleep,
    })
    expect(sleep).toHaveBeenCalledWith(350)
  })

  it('does not add unbounded delay after slow database work', async () => {
    const sleep = vi.fn(async () => undefined)
    await waitForNonEnumeratingAccountResponse(1_000, {
      jitter: () => 75,
      minimumMilliseconds: 400,
      now: () => 1_600,
      sleep,
    })
    expect(sleep).not.toHaveBeenCalled()
  })
})
