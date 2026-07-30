import 'server-only'

import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto'

import type { Payload, PayloadRequest } from 'payload'

import { isPasswordResetToken, normalizeAccountEmail } from '@/lib/domain/account-recovery'
import { isCloudVerificationToken } from '@/lib/domain/cloud-verification-token'
import type { PasswordResetDelivery } from './account-recovery-service'
import {
  createCloudPasswordResetSender,
  createCloudVerificationSender,
} from './cloud-email-delivery'
import { getCloudAccountRecoveryConfiguration } from './cloud-signup-config'
import type { VerificationDelivery } from './cloud-signup-service'
import { getServerEnvironment } from './env'
import {
  CLOUD_ACCOUNT_EMAIL_OUTBOX_QUEUE,
  CLOUD_ACCOUNT_EMAIL_OUTBOX_TASK,
  type CloudAccountEmailTask,
} from './cloud-account-email-task'

const envelopeVersion = 'v1'
const authenticatedContext = Buffer.from('linksetgo:cloud-account-email-outbox:v1', 'utf8')
const maximumEncryptedEnvelopeLength = 16_384

export type CloudAccountEmailDelivery =
  | {
      delivery: PasswordResetDelivery
      kind: 'password-reset'
    }
  | {
      delivery: VerificationDelivery
      kind: 'verification'
    }

type DeliveryDependencies = {
  now?: () => Date
  sendPasswordReset: (delivery: PasswordResetDelivery) => Promise<void>
  sendVerification: (delivery: VerificationDelivery) => Promise<void>
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const deriveEncryptionKey = (secret: string): Buffer => {
  if (secret.length < 32) throw new Error('Cloud email outbox encryption is unavailable.')
  return createHmac('sha256', secret)
    .update('linksetgo:cloud-account-email-outbox:encryption-key:v1', 'utf8')
    .digest()
}

const validInstant = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value))

const validName = (value: unknown): value is string =>
  typeof value === 'string' && value.length >= 1 && value.length <= 120 && !/[\r\n]/u.test(value)

const validActionURL = (
  value: unknown,
  pathname: string,
  tokenValidator: (token: unknown) => token is string,
): value is string => {
  if (typeof value !== 'string' || value.length > 4_096) return false
  try {
    const url = new URL(value)
    const isLoopback =
      url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
    const fragment = new URLSearchParams(url.hash.slice(1))
    return (
      !url.username &&
      !url.password &&
      !url.search &&
      url.pathname === pathname &&
      [...fragment.keys()].length === 1 &&
      tokenValidator(fragment.get('token')) &&
      (url.protocol === 'https:' || (process.env.NODE_ENV !== 'production' && isLoopback))
    )
  } catch {
    return false
  }
}

const parseDelivery = (value: unknown): CloudAccountEmailDelivery | null => {
  if (!isRecord(value) || !isRecord(value.delivery)) return null
  const email = normalizeAccountEmail(value.delivery.email)
  const expiresAt = value.delivery.expiresAt
  const name = value.delivery.name
  if (!email || !validInstant(expiresAt) || !validName(name)) return null

  if (
    value.kind === 'password-reset' &&
    validActionURL(value.delivery.resetURL, '/reset-password', isPasswordResetToken)
  ) {
    return {
      kind: 'password-reset',
      delivery: { email, expiresAt, name, resetURL: value.delivery.resetURL },
    }
  }
  if (
    value.kind === 'verification' &&
    validActionURL(value.delivery.verificationURL, '/verify-email', isCloudVerificationToken)
  ) {
    return {
      kind: 'verification',
      delivery: { email, expiresAt, name, verificationURL: value.delivery.verificationURL },
    }
  }
  return null
}

export function encryptCloudAccountEmailDelivery(
  value: CloudAccountEmailDelivery,
  secret: string,
): string {
  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', deriveEncryptionKey(secret), nonce)
  cipher.setAAD(authenticatedContext)
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  const authenticationTag = cipher.getAuthTag()
  return [
    envelopeVersion,
    nonce.toString('base64url'),
    authenticationTag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.')
}

export function decryptCloudAccountEmailDelivery(
  encryptedEnvelope: string,
  secret: string,
): CloudAccountEmailDelivery {
  if (
    encryptedEnvelope.length > maximumEncryptedEnvelopeLength ||
    !encryptedEnvelope.startsWith(`${envelopeVersion}.`)
  ) {
    throw new Error('Cloud email outbox envelope is invalid.')
  }
  const parts = encryptedEnvelope.split('.')
  if (parts.length !== 4 || parts[0] !== envelopeVersion) {
    throw new Error('Cloud email outbox envelope is invalid.')
  }

  try {
    const nonce = Buffer.from(parts[1]!, 'base64url')
    const authenticationTag = Buffer.from(parts[2]!, 'base64url')
    const ciphertext = Buffer.from(parts[3]!, 'base64url')
    if (nonce.length !== 12 || authenticationTag.length !== 16 || ciphertext.length === 0) {
      throw new Error('Invalid envelope shape.')
    }
    const decipher = createDecipheriv('aes-256-gcm', deriveEncryptionKey(secret), nonce)
    decipher.setAAD(authenticatedContext)
    decipher.setAuthTag(authenticationTag)
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
      'utf8',
    )
    const delivery = parseDelivery(JSON.parse(plaintext) as unknown)
    if (!delivery) throw new Error('Invalid delivery.')
    return delivery
  } catch {
    throw new Error('Cloud email outbox envelope is invalid.')
  }
}

export async function queueCloudAccountEmailDelivery(input: {
  delivery: CloudAccountEmailDelivery
  encryptionSecret: string
  payload: Payload
  req: PayloadRequest
}): Promise<void> {
  if (!input.req.transactionID) {
    throw new Error('Cloud email must be queued in the account-state transaction.')
  }
  await input.payload.jobs.queue({
    input: {
      encryptedEnvelope: encryptCloudAccountEmailDelivery(input.delivery, input.encryptionSecret),
      expiresAt: input.delivery.delivery.expiresAt,
    },
    overrideAccess: true,
    queue: CLOUD_ACCOUNT_EMAIL_OUTBOX_QUEUE,
    req: input.req,
    task: CLOUD_ACCOUNT_EMAIL_OUTBOX_TASK,
  })
}

export async function deliverCloudAccountEmail(
  input: CloudAccountEmailTask['input'],
  encryptionSecret: string,
  dependencies: DeliveryDependencies,
): Promise<boolean> {
  const delivery = decryptCloudAccountEmailDelivery(input.encryptedEnvelope, encryptionSecret)
  if (
    input.expiresAt !== delivery.delivery.expiresAt ||
    Date.parse(delivery.delivery.expiresAt) <= (dependencies.now ?? (() => new Date()))().getTime()
  ) {
    return false
  }
  if (delivery.kind === 'password-reset') {
    await dependencies.sendPasswordReset(delivery.delivery)
  } else {
    await dependencies.sendVerification(delivery.delivery)
  }
  return true
}

export async function handleCloudAccountEmailTask(
  input: CloudAccountEmailTask['input'],
): Promise<{ output: CloudAccountEmailTask['output'] }> {
  const configuration = getCloudAccountRecoveryConfiguration()
  if (configuration.status !== 'ready') {
    throw new Error('Cloud email delivery is unavailable.')
  }
  try {
    const delivered = await deliverCloudAccountEmail(
      input,
      getServerEnvironment().eventHashSecret,
      {
        sendPasswordReset: createCloudPasswordResetSender(configuration.emailDelivery),
        sendVerification: createCloudVerificationSender(configuration.emailDelivery),
      },
    )
    return { output: { delivered } }
  } catch {
    // Payload retains the encrypted job for bounded retry. Never copy provider
    // errors into the job record because they can contain transport details.
    throw new Error('Cloud email delivery failed.')
  }
}

export async function runCloudAccountEmailOutbox(payload: Payload, limit: number): Promise<void> {
  await payload.jobs.run({
    limit,
    overrideAccess: true,
    queue: CLOUD_ACCOUNT_EMAIL_OUTBOX_QUEUE,
    silent: true,
  })
}
