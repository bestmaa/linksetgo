import 'server-only'

import { createHmac, randomBytes } from 'node:crypto'

import {
  commitTransaction,
  createLocalReq,
  initTransaction,
  killTransaction,
  type Payload,
  type PayloadRequest,
} from 'payload'

import {
  isPasswordResetToken,
  isStrongAccountPassword,
  PASSWORD_RESET_TOKEN_TTL_MS,
} from '@/lib/domain/account-recovery'
import { queueCloudAccountEmailDelivery } from './cloud-account-email-outbox'
import { getLinksetGoEdition } from './deployment-edition'
import { acquireTransactionLock } from './postgres-lock'

export type PasswordResetDelivery = {
  email: string
  expiresAt: string
  name: string
  resetURL: string
}

export type PasswordResetSender = (delivery: PasswordResetDelivery) => Promise<void>

export type PasswordResetQueuer = (
  delivery: PasswordResetDelivery,
  req: PayloadRequest,
) => Promise<void>

const safeToken = (): string => randomBytes(32).toString('base64url')

export function hashPasswordResetToken(token: string, secret: string): string {
  if (secret.length < 32) throw new Error('Password-reset hashing is unavailable.')
  return createHmac('sha256', secret)
    .update('linksetgo:password-reset-token:v1\0', 'utf8')
    .update(token, 'utf8')
    .digest('hex')
}

export async function requestCloudPasswordReset(input: {
  appBaseURL: string
  authorizeDelivery?: (email: string) => Promise<boolean>
  email: string
  eventHashSecret: string
  now?: () => Date
  payload: Payload
  queueReset?: PasswordResetQueuer
  randomToken?: () => string
}): Promise<{ deliveryAttempted: boolean }> {
  if (getLinksetGoEdition() !== 'cloud') return { deliveryAttempted: false }

  const now = (input.now ?? (() => new Date()))()
  const req = await createLocalReq({}, input.payload)
  const ownsTransaction = await initTransaction(req)
  if (!ownsTransaction) throw new Error('Cloud account recovery could not be requested.')

  try {
    const users = await input.payload.find({
      collection: 'users',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      req,
      where: {
        and: [{ email: { equals: input.email } }, { status: { equals: 'active' } }],
      },
    })
    const user = users.docs[0]
    if (!user) {
      await commitTransaction(req)
      return { deliveryAttempted: false }
    }

    await acquireTransactionLock(req, 'cloud-password-recovery', String(user.id))
    const activeUsers = await input.payload.find({
      collection: 'users',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      req,
      where: {
        and: [{ id: { equals: user.id } }, { status: { equals: 'active' } }],
      },
    })
    const activeUser = activeUsers.docs[0]
    if (!activeUser) {
      await commitTransaction(req)
      return { deliveryAttempted: false }
    }
    if (input.authorizeDelivery && !(await input.authorizeDelivery(activeUser.email))) {
      await commitTransaction(req)
      return { deliveryAttempted: false }
    }

    const token = (input.randomToken ?? safeToken)()
    if (!isPasswordResetToken(token)) {
      throw new Error('A cryptographically strong reset token could not be generated.')
    }
    const expiresAt = new Date(now.getTime() + PASSWORD_RESET_TOKEN_TTL_MS).toISOString()
    await input.payload.update({
      collection: 'users',
      id: activeUser.id,
      data: {
        passwordResetExpiresAt: expiresAt,
        passwordResetTokenHash: hashPasswordResetToken(token, input.eventHashSecret),
        // Invalidate any bearer token created by Payload's legacy recovery API.
        resetPasswordExpiration: null,
        resetPasswordToken: null,
      },
      depth: 0,
      overrideAccess: true,
      req,
      showHiddenFields: true,
    })

    const resetURL = new URL('/reset-password', input.appBaseURL)
    resetURL.hash = new URLSearchParams({ token }).toString()
    const delivery: PasswordResetDelivery = {
      email: activeUser.email,
      expiresAt,
      name: activeUser.name,
      resetURL: resetURL.toString(),
    }
    const queueReset =
      input.queueReset ??
      ((queuedDelivery: PasswordResetDelivery, transactionRequest: PayloadRequest) =>
        queueCloudAccountEmailDelivery({
          delivery: { delivery: queuedDelivery, kind: 'password-reset' },
          encryptionSecret: input.eventHashSecret,
          payload: input.payload,
          req: transactionRequest,
        }))
    await queueReset(delivery, req)
    await commitTransaction(req)
    return { deliveryAttempted: true }
  } catch {
    await killTransaction(req)
    throw new Error('Cloud account recovery could not be requested.')
  }
}

export async function resetCloudPassword(input: {
  eventHashSecret: string
  now?: () => Date
  password: string
  payload: Payload
  token: string
}): Promise<void> {
  if (getLinksetGoEdition() !== 'cloud') throw new Error('Account recovery is unavailable.')
  if (!isPasswordResetToken(input.token) || !isStrongAccountPassword(input.password)) {
    throw new Error('This reset request is invalid.')
  }

  const tokenHash = hashPasswordResetToken(input.token, input.eventHashSecret)
  const now = (input.now ?? (() => new Date()))().toISOString()
  const req = await createLocalReq({}, input.payload)
  const ownsTransaction = await initTransaction(req)
  if (!ownsTransaction) throw new Error('Could not start an account-recovery transaction.')

  try {
    const users = await input.payload.find({
      collection: 'users',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      req,
      showHiddenFields: true,
      where: {
        and: [
          { passwordResetExpiresAt: { greater_than: now } },
          { passwordResetTokenHash: { equals: tokenHash } },
          { status: { equals: 'active' } },
        ],
      },
    })
    const user = users.docs[0]
    if (!user) throw new Error('This reset request is invalid.')

    await acquireTransactionLock(req, 'cloud-password-recovery', String(user.id))
    const lockedUsers = await input.payload.find({
      collection: 'users',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      req,
      showHiddenFields: true,
      where: {
        and: [
          { id: { equals: user.id } },
          { passwordResetExpiresAt: { greater_than: now } },
          { passwordResetTokenHash: { equals: tokenHash } },
          { status: { equals: 'active' } },
        ],
      },
    })
    if (lockedUsers.docs.length !== 1) throw new Error('This reset request is invalid.')

    await input.payload.update({
      collection: 'users',
      id: user.id,
      data: {
        lockUntil: null,
        loginAttempts: 0,
        password: input.password,
        passwordResetExpiresAt: null,
        passwordResetTokenHash: null,
        resetPasswordExpiration: null,
        resetPasswordToken: null,
        sessions: [],
      },
      depth: 0,
      overrideAccess: true,
      req,
      showHiddenFields: true,
    })
    await commitTransaction(req)
  } catch {
    await killTransaction(req)
    throw new Error('This reset request is invalid.')
  }
}
