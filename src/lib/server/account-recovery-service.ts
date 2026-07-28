import 'server-only'

import {
  commitTransaction,
  createLocalReq,
  initTransaction,
  killTransaction,
  type Payload,
} from 'payload'

import { PASSWORD_RESET_TOKEN_TTL_MS } from '@/lib/domain/account-recovery'
import { getRelayEdition } from './deployment-edition'

export type PasswordResetDelivery = {
  email: string
  expiresAt: string
  name: string
  resetURL: string
}

export type PasswordResetSender = (delivery: PasswordResetDelivery) => Promise<void>

export async function requestCloudPasswordReset(input: {
  appBaseURL: string
  email: string
  payload: Payload
  sendReset: PasswordResetSender
}): Promise<{ deliveryAttempted: boolean }> {
  if (getRelayEdition() !== 'cloud') return { deliveryAttempted: false }

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
      where: {
        and: [{ email: { equals: input.email } }, { status: { equals: 'active' } }],
      },
    })
    const user = users.docs[0]
    if (!user) {
      await commitTransaction(req)
      return { deliveryAttempted: false }
    }

    const token = await input.payload.forgotPassword({
      collection: 'users',
      data: { email: input.email },
      disableEmail: true,
      expiration: PASSWORD_RESET_TOKEN_TTL_MS,
      overrideAccess: true,
      req,
    })
    if (!token) {
      await commitTransaction(req)
      return { deliveryAttempted: false }
    }

    const resetURL = new URL('/reset-password', input.appBaseURL)
    resetURL.hash = new URLSearchParams({ token }).toString()
    await input.sendReset({
      email: user.email,
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS).toISOString(),
      name: user.name,
      resetURL: resetURL.toString(),
    })

    await commitTransaction(req)
    return { deliveryAttempted: true }
  } catch (error) {
    await killTransaction(req)
    throw error
  }
}

export async function resetCloudPassword(input: {
  password: string
  payload: Payload
  token: string
}): Promise<void> {
  if (getRelayEdition() !== 'cloud') throw new Error('Account recovery is unavailable.')

  await input.payload.resetPassword({
    collection: 'users',
    data: { password: input.password, token: input.token },
    overrideAccess: true,
  })
}
