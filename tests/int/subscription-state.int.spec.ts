import { describe, expect, it } from 'vitest'

import {
  getSubscriptionAccess,
  reconcileSubscriptionEvent,
  type SubscriptionEvent,
  type SubscriptionState,
} from '../../src/lib/domain/subscription-state'

const activeEvent: SubscriptionEvent = {
  currentPeriodEnd: '2026-09-01T00:00:00.000Z',
  eventID: 'evt_002',
  graceEndsAt: null,
  occurredAt: '2026-08-01T00:00:00.000Z',
  plan: 'starter',
  providerSubscriptionID: 'sub_001',
  status: 'active',
}

function appliedState(): SubscriptionState {
  const result = reconcileSubscriptionEvent(null, activeEvent)
  if (result.kind !== 'applied') throw new Error('Expected an applied event.')
  return result.state
}

describe('subscription state', () => {
  it('applies an initial provider event and normalizes timestamps', () => {
    expect(reconcileSubscriptionEvent(null, activeEvent)).toEqual({
      kind: 'applied',
      state: {
        currentPeriodEnd: '2026-09-01T00:00:00.000Z',
        graceEndsAt: null,
        lastEventAt: '2026-08-01T00:00:00.000Z',
        lastProviderEventID: 'evt_002',
        plan: 'starter',
        providerSubscriptionID: 'sub_001',
        status: 'active',
      },
    })
  })

  it('ignores duplicate and out-of-order provider events', () => {
    const current = appliedState()

    expect(reconcileSubscriptionEvent(current, activeEvent).kind).toBe('duplicate')
    expect(
      reconcileSubscriptionEvent(current, {
        ...activeEvent,
        eventID: 'evt_001',
        occurredAt: '2026-07-31T23:59:59.000Z',
        status: 'canceled',
      }).kind,
    ).toBe('stale')
  })

  it('keeps existing links resolving after payment failure', () => {
    const pastDue: SubscriptionState = {
      ...appliedState(),
      graceEndsAt: '2026-08-08T00:00:00.000Z',
      status: 'past-due',
    }

    expect(getSubscriptionAccess(pastDue, new Date('2026-08-05T00:00:00.000Z'))).toEqual({
      canCreate: true,
      canResolve: true,
      reason: 'grace-period',
    })
    expect(getSubscriptionAccess(pastDue, new Date('2026-08-09T00:00:00.000Z'))).toEqual({
      canCreate: false,
      canResolve: true,
      reason: 'past-due',
    })
  })

  it('honors a canceled subscription until its paid period ends', () => {
    const canceled: SubscriptionState = { ...appliedState(), status: 'canceled' }

    expect(getSubscriptionAccess(canceled, new Date('2026-08-15T00:00:00.000Z')).canCreate).toBe(
      true,
    )
    expect(getSubscriptionAccess(canceled, new Date('2026-09-02T00:00:00.000Z'))).toEqual({
      canCreate: false,
      canResolve: true,
      reason: 'canceled',
    })
  })
})
