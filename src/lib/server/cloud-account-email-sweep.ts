import 'server-only'

import { timingSafeEqual } from 'node:crypto'

import type { Payload } from 'payload'

import { runCloudAccountEmailOutbox } from './cloud-account-email-outbox'

type EnvironmentSource = Readonly<Record<string, string | undefined>>

export type CloudAccountEmailSweepConfiguration =
  | { status: 'disabled' }
  | { message: string; status: 'misconfigured' }
  | { batchSize: number; secret: string; status: 'ready' }

const defaultBatchSize = 10
const maximumBatchSize = 25

export function getCloudAccountEmailSweepConfiguration(
  environment: EnvironmentSource = process.env,
): CloudAccountEmailSweepConfiguration {
  const configuredSecret = environment.CLOUD_ACCOUNT_EMAIL_SWEEP_SECRET
  if (configuredSecret === undefined || configuredSecret.trim() === '') {
    return { status: 'disabled' }
  }
  const secret = configuredSecret.trim()
  if (secret.length < 32 || secret.length > 1_024 || /[\u0000-\u001f\u007f]/u.test(secret)) {
    return {
      message: 'CLOUD_ACCOUNT_EMAIL_SWEEP_SECRET must contain 32 to 1024 safe characters.',
      status: 'misconfigured',
    }
  }

  const batchValue = environment.CLOUD_ACCOUNT_EMAIL_SWEEP_BATCH_SIZE?.trim()
  const batchSize = batchValue ? Number(batchValue) : defaultBatchSize
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > maximumBatchSize) {
    return {
      message: `CLOUD_ACCOUNT_EMAIL_SWEEP_BATCH_SIZE must be between 1 and ${maximumBatchSize}.`,
      status: 'misconfigured',
    }
  }
  return { batchSize, secret, status: 'ready' }
}

export function authorizeCloudAccountEmailSweep(
  authorization: string | null,
  expectedSecret: string,
): boolean {
  const match = /^Bearer ([^\s]+)$/u.exec(authorization ?? '')
  if (!match) return false
  const supplied = Buffer.from(match[1]!, 'utf8')
  const expected = Buffer.from(expectedSecret, 'utf8')
  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
}

export async function runCloudAccountEmailOutboxSafely(
  payload: Payload,
  limit: number = 3,
): Promise<void> {
  try {
    await runCloudAccountEmailOutbox(payload, limit)
  } catch {
    // The durable queue remains available for the authenticated scheduled sweep.
  }
}
