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

  it('publishes the revised managed Cloud limits', () => {
    expect(getPlanDefinition('free').limits).toEqual({
      activeLinks: 250,
      analyticsRetentionDays: 14,
      apps: 1,
      customDomains: 0,
      members: 1,
      monthlyResolutions: 15_000,
    })
    expect(getPlanDefinition('starter').limits).toEqual({
      activeLinks: 2_500,
      analyticsRetentionDays: 90,
      apps: 5,
      customDomains: 1,
      members: 3,
      monthlyResolutions: 150_000,
    })
    expect(getPlanDefinition('pro').limits).toEqual({
      activeLinks: 10_000,
      analyticsRetentionDays: 365,
      apps: 20,
      customDomains: 5,
      members: 10,
      monthlyResolutions: 1_000_000,
    })
  })

  it('warns at eighty percent and blocks creation at the limit', () => {
    const free = getPlanDefinition('free')

    expect(getPlanUsageState(free, 'activeLinks', 199).kind).toBe('available')
    expect(getPlanUsageState(free, 'activeLinks', 200)).toEqual({
      kind: 'warning',
      limit: 250,
      remaining: 50,
      used: 200,
    })
    expect(canCreateResource(free, 'activeLinks', 250)).toBe(false)
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
      limit: 3,
      remaining: 3,
      used: 0,
    })
  })
})
