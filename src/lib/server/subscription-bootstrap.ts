import 'server-only'

import {
  commitTransaction,
  createLocalReq,
  initTransaction,
  killTransaction,
  type Payload,
  type PayloadRequest,
} from 'payload'

import { PLAN_CATALOG_VERSION } from '@/lib/domain/plan-catalog'
import type { Subscription } from '@/payload-types'
import { acquireTransactionLock } from './postgres-lock'
import { requireCloudEdition } from './deployment-edition'

export async function ensureFreeSubscriptionForOrganization(
  payload: Payload,
  organizationID: number | string,
  suppliedReq?: PayloadRequest,
): Promise<Subscription> {
  requireCloudEdition()
  const numericOrganizationID =
    typeof organizationID === 'number' ? organizationID : Number(organizationID)
  if (!Number.isSafeInteger(numericOrganizationID) || numericOrganizationID <= 0) {
    throw new Error('A free subscription requires a valid organization ID.')
  }

  const req = suppliedReq ?? (await createLocalReq({}, payload))
  const ownsTransaction = req.transactionID ? false : await initTransaction(req)
  if (!req.transactionID) {
    throw new Error('A free subscription requires an atomic database transaction.')
  }

  try {
    await acquireTransactionLock(req, 'subscription-bootstrap', String(numericOrganizationID))

    const existing = await payload.find({
      collection: 'subscriptions',
      depth: 0,
      limit: 2,
      overrideAccess: true,
      pagination: false,
      req,
      where: { organization: { equals: numericOrganizationID } },
    })
    if (existing.docs.length > 1) {
      throw new Error('Organization has conflicting subscription records.')
    }

    const subscription =
      existing.docs[0] ??
      (await payload.create({
        collection: 'subscriptions',
        data: {
          catalogVersion: PLAN_CATALOG_VERSION,
          lastEventAt: new Date().toISOString(),
          lastProviderEventID: `relay-free-initialized:${numericOrganizationID}`,
          organization: numericOrganizationID,
          plan: 'free',
          provider: 'relay-internal',
          providerSubscriptionID: `relay-free:${numericOrganizationID}`,
          status: 'active',
        },
        depth: 0,
        overrideAccess: true,
        req,
      }))

    if (ownsTransaction) await commitTransaction(req)
    return subscription
  } catch (error) {
    if (ownsTransaction) await killTransaction(req)
    throw error
  }
}
