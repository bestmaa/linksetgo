import 'server-only'

import { createHash } from 'node:crypto'

import {
  commitTransaction,
  createLocalReq,
  initTransaction,
  killTransaction,
  type Payload,
} from 'payload'

import type { BillingProvider, BillingWebhookRequest } from '@/lib/application/billing-provider'
import {
  reconcileSubscriptionEvent,
  type SubscriptionEvent,
  type SubscriptionState,
} from '@/lib/domain/subscription-state'
import type { Subscription } from '@/payload-types'
import { getLinksetGoEdition } from './deployment-edition'
import { acquireTransactionLock } from './postgres-lock'
import { relationID } from './tenant-context'

export type BillingWebhookOutcome =
  | { kind: 'applied' | 'duplicate' | 'stale'; eventID: string; organizationID: string }
  | { kind: 'disabled'; message: string }
  | { kind: 'error'; message: string; retryable: boolean }

type ProcessBillingWebhookInput = {
  payload: Payload
  provider: BillingProvider
  providerKey?: string
  request: BillingWebhookRequest
}

const numericRelationshipID = (id: string): number => {
  const value = Number(id)
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error('Billing data contains an invalid relationship ID.')
  }
  return value
}

const storedState = (subscription: Subscription): SubscriptionState => ({
  currentPeriodEnd: subscription.currentPeriodEnd ?? null,
  graceEndsAt: subscription.graceEndsAt ?? null,
  lastEventAt: subscription.lastEventAt,
  lastProviderEventID: subscription.lastProviderEventID,
  plan: subscription.plan,
  providerSubscriptionID: subscription.providerSubscriptionID,
  status: subscription.status,
})

const safeProviderKey = (value: string | undefined): string => {
  const normalized = value?.trim().toLowerCase() || 'configured'
  return /^[a-z0-9_-]{1,64}$/.test(normalized) ? normalized : 'configured'
}

async function existingEventOrganization(
  payload: Payload,
  eventID: string,
): Promise<string | null> {
  const events = await payload.find({
    collection: 'billing-events',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    where: { providerEventID: { equals: eventID } },
  })
  return relationID(events.docs[0]?.organization)
}

async function findSubscription(
  payload: Payload,
  event: SubscriptionEvent,
  req: Awaited<ReturnType<typeof createLocalReq>>,
): Promise<Subscription | null> {
  const subscriptions = await payload.find({
    collection: 'subscriptions',
    depth: 0,
    limit: 2,
    overrideAccess: true,
    pagination: false,
    req,
    where: { providerSubscriptionID: { equals: event.providerSubscriptionID } },
  })
  if (subscriptions.docs.length > 1) {
    throw new Error('Provider subscription identity is not unique.')
  }
  return subscriptions.docs[0] ?? null
}

async function findOrganizationSubscription(
  payload: Payload,
  organizationID: number,
  req: Awaited<ReturnType<typeof createLocalReq>>,
): Promise<Subscription | null> {
  const subscriptions = await payload.find({
    collection: 'subscriptions',
    depth: 0,
    limit: 2,
    overrideAccess: true,
    pagination: false,
    req,
    where: { organization: { equals: organizationID } },
  })
  if (subscriptions.docs.length > 1) {
    throw new Error('Organization has conflicting subscription records.')
  }
  return subscriptions.docs[0] ?? null
}

const isBindableFreeSubscription = (subscription: Subscription): boolean =>
  subscription.plan === 'free' &&
  subscription.provider === 'relay-internal' &&
  subscription.providerSubscriptionID.startsWith('relay-free:')

export async function processBillingWebhook({
  payload,
  provider,
  providerKey,
  request,
}: ProcessBillingWebhookInput): Promise<BillingWebhookOutcome> {
  if (getLinksetGoEdition() !== 'cloud') {
    return { kind: 'disabled', message: 'Billing webhooks are disabled in Community edition.' }
  }

  let verified
  try {
    verified = await provider.verifyAndParseWebhook(request)
  } catch {
    return { kind: 'error', message: 'Billing webhook verification failed.', retryable: true }
  }
  if (verified.kind !== 'success') return verified

  const event = verified.value
  let normalized
  try {
    normalized = reconcileSubscriptionEvent(null, event)
  } catch {
    return { kind: 'error', message: 'Billing webhook payload is invalid.', retryable: false }
  }
  const normalizedEvent = normalized.state
  const req = await createLocalReq({}, payload)
  const ownsTransaction = await initTransaction(req)
  if (!ownsTransaction) {
    return {
      kind: 'error',
      message: 'Billing reconciliation could not start an atomic transaction.',
      retryable: true,
    }
  }

  try {
    await acquireTransactionLock(req, 'billing-subscription', event.providerSubscriptionID)
    const boundOrganizationID = event.organizationID
      ? numericRelationshipID(event.organizationID)
      : null
    if (boundOrganizationID) {
      await acquireTransactionLock(req, 'billing-organization', String(boundOrganizationID))
    }
    const duplicateOrganizationID = await existingEventOrganizationInRequest(
      payload,
      event.eventID,
      req,
    )
    if (duplicateOrganizationID) {
      await commitTransaction(req)
      return { kind: 'duplicate', eventID: event.eventID, organizationID: duplicateOrganizationID }
    }

    let subscription = await findSubscription(payload, event, req)
    if (!subscription && boundOrganizationID) {
      const candidate = await findOrganizationSubscription(payload, boundOrganizationID, req)
      if (candidate && isBindableFreeSubscription(candidate)) subscription = candidate
    }
    const organizationID = relationID(subscription?.organization)
    if (!subscription || !organizationID) {
      await killTransaction(req)
      return {
        kind: 'error',
        message: 'Billing webhook references an unknown subscription.',
        retryable: false,
      }
    }
    if (boundOrganizationID && organizationID !== String(boundOrganizationID)) {
      await killTransaction(req)
      return {
        kind: 'error',
        message: 'Billing webhook organization binding does not match.',
        retryable: false,
      }
    }
    if (
      event.providerCustomerID &&
      subscription.providerCustomerID &&
      event.providerCustomerID !== subscription.providerCustomerID
    ) {
      await killTransaction(req)
      return {
        kind: 'error',
        message: 'Billing webhook customer binding does not match.',
        retryable: false,
      }
    }

    const reconciliation = reconcileSubscriptionEvent(storedState(subscription), event)
    if (reconciliation.kind === 'duplicate') {
      await commitTransaction(req)
      return { kind: 'duplicate', eventID: event.eventID, organizationID }
    }

    if (reconciliation.kind === 'applied') {
      const state = reconciliation.state
      await payload.update({
        collection: 'subscriptions',
        id: subscription.id,
        data: {
          currentPeriodEnd: state.currentPeriodEnd,
          graceEndsAt: state.graceEndsAt,
          lastEventAt: state.lastEventAt,
          lastProviderEventID: state.lastProviderEventID,
          plan: state.plan,
          ...(event.providerCustomerID ? { providerCustomerID: event.providerCustomerID } : {}),
          provider: safeProviderKey(providerKey),
          providerSubscriptionID: state.providerSubscriptionID,
          status: state.status,
        },
        depth: 0,
        overrideAccess: true,
        req,
      })
    }

    await payload.create({
      collection: 'billing-events',
      data: {
        organization: numericRelationshipID(organizationID),
        outcome: reconciliation.kind,
        payloadHash: createHash('sha256').update(request.body).digest('hex'),
        plan: normalizedEvent.plan,
        provider: safeProviderKey(providerKey),
        providerEventID: event.eventID,
        providerSubscriptionID: normalizedEvent.providerSubscriptionID,
        receivedAt: new Date().toISOString(),
        occurredAt: normalizedEvent.lastEventAt,
        status: normalizedEvent.status,
      },
      depth: 0,
      overrideAccess: true,
      req,
    })

    await commitTransaction(req)
    return { kind: reconciliation.kind, eventID: event.eventID, organizationID }
  } catch {
    await killTransaction(req)
    const organizationID = await existingEventOrganization(payload, event.eventID).catch(() => null)
    if (organizationID) {
      return { kind: 'duplicate', eventID: event.eventID, organizationID }
    }
    return { kind: 'error', message: 'Billing reconciliation failed.', retryable: true }
  }
}

async function existingEventOrganizationInRequest(
  payload: Payload,
  eventID: string,
  req: Awaited<ReturnType<typeof createLocalReq>>,
): Promise<string | null> {
  const events = await payload.find({
    collection: 'billing-events',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    req,
    where: { providerEventID: { equals: eventID } },
  })
  return relationID(events.docs[0]?.organization)
}
