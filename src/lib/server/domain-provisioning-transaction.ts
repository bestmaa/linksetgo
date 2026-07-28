import 'server-only'

import {
  commitTransaction,
  createLocalReq,
  initTransaction,
  killTransaction,
  type Payload,
} from 'payload'

import type { User } from '@/payload-types'
import { acquireTransactionLock } from './postgres-lock'
import { type DomainActionResult, unavailableDomainAction } from './domain-provisioning-result'

export async function withLockedDomainAction(input: {
  action: (req: Awaited<ReturnType<typeof createLocalReq>>) => Promise<DomainActionResult>
  domainID: string
  payload: Payload
  user: User
  workspaceID: string
}): Promise<DomainActionResult> {
  const req = await createLocalReq({ user: input.user }, input.payload)
  const ownsTransaction = await initTransaction(req)
  if (!ownsTransaction) return unavailableDomainAction()

  try {
    await acquireTransactionLock(
      req,
      'custom-domain-action',
      `${input.workspaceID}:${input.domainID}`,
    )
    const result = await input.action(req)
    await commitTransaction(req)
    return result
  } catch {
    await killTransaction(req)
    return unavailableDomainAction()
  }
}
