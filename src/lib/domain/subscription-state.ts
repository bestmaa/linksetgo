import type { CloudPlanKey } from './plan-catalog'

export type SubscriptionStatus = 'active' | 'canceled' | 'past-due' | 'paused' | 'trialing'

export type SubscriptionState = {
  currentPeriodEnd: string | null
  graceEndsAt: string | null
  lastEventAt: string
  lastProviderEventID: string
  plan: CloudPlanKey
  providerSubscriptionID: string
  status: SubscriptionStatus
}

export type SubscriptionEvent = {
  currentPeriodEnd: string | null
  eventID: string
  graceEndsAt: string | null
  organizationID?: string
  occurredAt: string
  plan: CloudPlanKey
  providerCustomerID?: string
  providerSubscriptionID: string
  status: SubscriptionStatus
}

export type SubscriptionAccess = {
  canCreate: boolean
  canResolve: boolean
  reason: 'active' | 'canceled' | 'grace-period' | 'past-due' | 'paused'
}

export type SubscriptionReconciliation =
  | { kind: 'applied'; state: SubscriptionState }
  | { kind: 'duplicate'; state: SubscriptionState }
  | { kind: 'stale'; state: SubscriptionState }

export function reconcileSubscriptionEvent(
  current: SubscriptionState | null,
  event: SubscriptionEvent,
): SubscriptionReconciliation {
  if (current?.lastProviderEventID === event.eventID) {
    return { kind: 'duplicate', state: current }
  }

  if (current && compareEventOrder(event, current) < 0) {
    return { kind: 'stale', state: current }
  }

  return {
    kind: 'applied',
    state: {
      currentPeriodEnd: normalizeInstant(event.currentPeriodEnd),
      graceEndsAt: normalizeInstant(event.graceEndsAt),
      lastEventAt: requireInstant(event.occurredAt),
      lastProviderEventID: event.eventID,
      plan: event.plan,
      providerSubscriptionID: event.providerSubscriptionID,
      status: event.status,
    },
  }
}

export function getSubscriptionAccess(state: SubscriptionState, now: Date): SubscriptionAccess {
  if (state.status === 'active' || state.status === 'trialing') {
    return { canCreate: true, canResolve: true, reason: 'active' }
  }

  if (state.status === 'past-due' && isInstantInFuture(state.graceEndsAt, now)) {
    return { canCreate: true, canResolve: true, reason: 'grace-period' }
  }

  if (state.status === 'canceled' && isInstantInFuture(state.currentPeriodEnd, now)) {
    return { canCreate: true, canResolve: true, reason: 'grace-period' }
  }

  if (state.status === 'paused') {
    return { canCreate: false, canResolve: true, reason: 'paused' }
  }

  return {
    canCreate: false,
    canResolve: true,
    reason: state.status === 'canceled' ? 'canceled' : 'past-due',
  }
}

function compareEventOrder(event: SubscriptionEvent, current: SubscriptionState): number {
  const eventTime = requireInstant(event.occurredAt)
  const timeOrder = eventTime.localeCompare(current.lastEventAt)
  return timeOrder === 0 ? event.eventID.localeCompare(current.lastProviderEventID) : timeOrder
}

function isInstantInFuture(value: string | null, now: Date): boolean {
  return value !== null && new Date(value).getTime() > now.getTime()
}

function normalizeInstant(value: string | null): string | null {
  return value === null ? null : requireInstant(value)
}

function requireInstant(value: string): string {
  const instant = new Date(value)
  if (Number.isNaN(instant.getTime())) {
    throw new Error('Subscription event contains an invalid timestamp.')
  }
  return instant.toISOString()
}
