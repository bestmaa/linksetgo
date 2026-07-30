import { describe, expect, it } from 'vitest'

import {
  canCreateResource,
  getPlanDefinition,
  getPlanUsageState,
  PLAN_CATALOG_VERSION,
} from '../../src/lib/domain/plan-catalog'
import { fallbackBindingLimitsForPlan } from '../../src/lib/domain/fallback-binding-limits'

describe('versioned plan catalog', () => {
  it('keeps the published beta prices in integer minor units', () => {
    expect(PLAN_CATALOG_VERSION).toBe(2)
    expect(getPlanDefinition('starter').priceMonthlyMinor).toBe(500)
    expect(getPlanDefinition('pro').priceMonthlyMinor).toBe(1_000)
  })

  it('publishes the revised managed Cloud limits', () => {
    expect(getPlanDefinition('free').limits).toEqual({
      activeLinks: 10,
      analyticsRetentionDays: 7,
      apps: 1,
      customDomains: 0,
      members: 1,
      monthlyResolutions: 1_000,
      savedLinks: 25,
      workspaces: 1,
    })
    expect(getPlanDefinition('starter').limits).toEqual({
      activeLinks: 2_500,
      analyticsRetentionDays: 90,
      apps: 5,
      customDomains: 1,
      members: 3,
      monthlyResolutions: 150_000,
      savedLinks: 2_500,
      workspaces: 5,
    })
    expect(getPlanDefinition('pro').limits).toEqual({
      activeLinks: 10_000,
      analyticsRetentionDays: 365,
      apps: 20,
      customDomains: 5,
      members: 10,
      monthlyResolutions: 1_000_000,
      savedLinks: 10_000,
      workspaces: 20,
    })
  })

  it('warns at eighty percent and blocks creation at the limit', () => {
    const free = getPlanDefinition('free')

    expect(getPlanUsageState(free, 'activeLinks', 7).kind).toBe('available')
    expect(getPlanUsageState(free, 'activeLinks', 8)).toEqual({
      kind: 'warning',
      limit: 10,
      remaining: 2,
      used: 8,
    })
    expect(canCreateResource(free, 'activeLinks', 10)).toBe(false)
    expect(canCreateResource(free, 'savedLinks', 25)).toBe(false)
    expect(canCreateResource(free, 'workspaces', 1)).toBe(false)
  })

  it('never imposes cloud quotas on Community installations', () => {
    const community = getPlanDefinition('community')

    expect(getPlanUsageState(community, 'apps', 1_000)).toEqual({
      kind: 'unlimited',
      used: 1_000,
    })
    expect(canCreateResource(community, 'apps', 1_000)).toBe(true)
  })

  it('derives bounded fallback safety capacity from the plan resource envelope', () => {
    expect(fallbackBindingLimitsForPlan(getPlanDefinition('free'))).toEqual({
      assessmentRecords: 31,
      assessments: 26,
      origins: 5,
    })
    expect(fallbackBindingLimitsForPlan(getPlanDefinition('starter'))).toEqual({
      assessmentRecords: 2_530,
      assessments: 2_505,
      origins: 25,
    })
    expect(fallbackBindingLimitsForPlan(getPlanDefinition('pro'))).toEqual({
      assessmentRecords: 10_120,
      assessments: 10_020,
      origins: 100,
    })
    expect(fallbackBindingLimitsForPlan(getPlanDefinition('community'))).toEqual({
      assessmentRecords: 'unlimited',
      assessments: 'unlimited',
      origins: 'unlimited',
    })
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
