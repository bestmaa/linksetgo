import type { Payload, PayloadRequest } from 'payload'

import {
  getPlanDefinition,
  type CloudPlanKey,
  type PlanDefinition,
} from '@/lib/domain/plan-catalog'
import {
  getSubscriptionAccess,
  type SubscriptionAccess,
  type SubscriptionState,
  type SubscriptionStatus,
} from '@/lib/domain/subscription-state'
import type { Subscription } from '@/payload-types'
import { getRelayEdition } from './deployment-edition'
import { relationID } from './tenant-context'

export type OrganizationPlanResolution = {
  access: SubscriptionAccess
  plan: PlanDefinition
  source: 'cloud-default' | 'community' | 'subscription'
  subscription: Subscription | null
}

const defaultCloudAccess: SubscriptionAccess = {
  canCreate: true,
  canResolve: true,
  reason: 'active',
}

const subscriptionState = (subscription: Subscription): SubscriptionState => ({
  currentPeriodEnd: subscription.currentPeriodEnd ?? null,
  graceEndsAt: subscription.graceEndsAt ?? null,
  lastEventAt: subscription.lastEventAt,
  lastProviderEventID: subscription.lastProviderEventID,
  plan: subscription.plan as CloudPlanKey,
  providerSubscriptionID: subscription.providerSubscriptionID,
  status: subscription.status as SubscriptionStatus,
})

export async function resolveOrganizationPlan(
  payload: Payload,
  organizationID: number | string,
  options: {
    edition?: string
    now?: Date
    req?: PayloadRequest
  } = {},
): Promise<OrganizationPlanResolution> {
  if (getRelayEdition(options.edition) === 'community') {
    return {
      access: defaultCloudAccess,
      plan: getPlanDefinition('community'),
      source: 'community',
      subscription: null,
    }
  }

  const subscriptions = await payload.find({
    collection: 'subscriptions',
    depth: 0,
    limit: 2,
    overrideAccess: true,
    pagination: false,
    ...(options.req ? { req: options.req } : {}),
    where: { organization: { equals: organizationID } },
  })

  if (subscriptions.docs.length > 1) {
    throw new Error('Organization has conflicting subscription records.')
  }

  const subscription = subscriptions.docs[0] ?? null
  if (!subscription) {
    return {
      access: defaultCloudAccess,
      plan: getPlanDefinition('free'),
      source: 'cloud-default',
      subscription: null,
    }
  }

  const storedOrganizationID = relationID(subscription.organization)
  if (!storedOrganizationID || storedOrganizationID !== String(organizationID)) {
    throw new Error('Subscription organization scope is invalid.')
  }

  return {
    access: getSubscriptionAccess(subscriptionState(subscription), options.now ?? new Date()),
    plan: getPlanDefinition(subscription.plan as CloudPlanKey),
    source: 'subscription',
    subscription,
  }
}
