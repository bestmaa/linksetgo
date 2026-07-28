import { describe, expect, it } from 'vitest'

import {
  canCreateResource,
  getPlanDefinition,
  getPlanUsageState,
  PLAN_CATALOG_VERSION,
} from '../../src/lib/domain/plan-catalog'

describe('versioned plan catalog', () => {
  it('keeps the published beta prices in integer minor units', () => {
    expect(PLAN_CATALOG_VERSION).toBe(1)
    expect(getPlanDefinition('starter').priceMonthlyMinor).toBe(500)
    expect(getPlanDefinition('pro').priceMonthlyMinor).toBe(1_000)
  })

  it('warns at eighty percent and blocks creation at the limit', () => {
    const free = getPlanDefinition('free')

    expect(getPlanUsageState(free, 'activeLinks', 19).kind).toBe('available')
    expect(getPlanUsageState(free, 'activeLinks', 20)).toEqual({
      kind: 'warning',
      limit: 25,
      remaining: 5,
      used: 20,
    })
    expect(canCreateResource(free, 'activeLinks', 25)).toBe(false)
  })

  it('never imposes cloud quotas on Community installations', () => {
    const community = getPlanDefinition('community')

    expect(getPlanUsageState(community, 'apps', 1_000)).toEqual({
      kind: 'unlimited',
      used: 1_000,
    })
    expect(canCreateResource(community, 'apps', 1_000)).toBe(true)
  })

  it('normalizes invalid negative usage without throwing', () => {
    expect(getPlanUsageState(getPlanDefinition('starter'), 'members', -5)).toEqual({
      kind: 'available',
      limit: 2,
      remaining: 2,
      used: 0,
    })
  })
})
