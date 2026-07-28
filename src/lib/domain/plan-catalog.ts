export const PLAN_CATALOG_VERSION = 1 as const

export type CloudPlanKey = 'free' | 'pro' | 'starter'
export type PlanKey = 'community' | CloudPlanKey
export type PlanMetric =
  | 'activeLinks'
  | 'analyticsRetentionDays'
  | 'apps'
  | 'customDomains'
  | 'members'
  | 'monthlyResolutions'

export type PlanLimit = number | 'unlimited'

export type PlanDefinition = {
  currency: 'USD' | null
  key: PlanKey
  limits: Readonly<Record<PlanMetric, PlanLimit>>
  name: string
  priceMonthlyMinor: number | null
  version: typeof PLAN_CATALOG_VERSION
}

export type PlanUsageState =
  | { kind: 'available'; limit: number; remaining: number; used: number }
  | { kind: 'blocked'; limit: number; remaining: 0; used: number }
  | { kind: 'unlimited'; used: number }
  | { kind: 'warning'; limit: number; remaining: number; used: number }

export const planCatalog = {
  community: {
    currency: null,
    key: 'community',
    limits: {
      activeLinks: 'unlimited',
      analyticsRetentionDays: 'unlimited',
      apps: 'unlimited',
      customDomains: 'unlimited',
      members: 'unlimited',
      monthlyResolutions: 'unlimited',
    },
    name: 'Community',
    priceMonthlyMinor: null,
    version: PLAN_CATALOG_VERSION,
  },
  free: {
    currency: 'USD',
    key: 'free',
    limits: {
      activeLinks: 25,
      analyticsRetentionDays: 7,
      apps: 1,
      customDomains: 0,
      members: 1,
      monthlyResolutions: 5_000,
    },
    name: 'Cloud Free',
    priceMonthlyMinor: 0,
    version: PLAN_CATALOG_VERSION,
  },
  pro: {
    currency: 'USD',
    key: 'pro',
    limits: {
      activeLinks: 2_000,
      analyticsRetentionDays: 90,
      apps: 10,
      customDomains: 1,
      members: 5,
      monthlyResolutions: 100_000,
    },
    name: 'Pro',
    priceMonthlyMinor: 1_000,
    version: PLAN_CATALOG_VERSION,
  },
  starter: {
    currency: 'USD',
    key: 'starter',
    limits: {
      activeLinks: 250,
      analyticsRetentionDays: 30,
      apps: 3,
      customDomains: 0,
      members: 2,
      monthlyResolutions: 25_000,
    },
    name: 'Starter',
    priceMonthlyMinor: 500,
    version: PLAN_CATALOG_VERSION,
  },
} as const satisfies Record<PlanKey, PlanDefinition>

export function getPlanDefinition(plan: PlanKey): PlanDefinition {
  return planCatalog[plan]
}

export function getPlanUsageState(
  plan: PlanDefinition,
  metric: PlanMetric,
  used: number,
): PlanUsageState {
  const normalizedUsed = Math.max(0, Math.floor(used))
  const limit = plan.limits[metric]

  if (limit === 'unlimited') {
    return { kind: 'unlimited', used: normalizedUsed }
  }

  const remaining = Math.max(0, limit - normalizedUsed)

  if (remaining === 0) {
    return { kind: 'blocked', limit, remaining, used: normalizedUsed }
  }

  if (normalizedUsed / limit >= 0.8) {
    return { kind: 'warning', limit, remaining, used: normalizedUsed }
  }

  return { kind: 'available', limit, remaining, used: normalizedUsed }
}

export function canCreateResource(
  plan: PlanDefinition,
  metric: Extract<PlanMetric, 'activeLinks' | 'apps' | 'customDomains' | 'members'>,
  currentUsage: number,
): boolean {
  return getPlanUsageState(plan, metric, currentUsage).kind !== 'blocked'
}
