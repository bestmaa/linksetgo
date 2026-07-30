import type { PlanDefinition, PlanLimit } from './plan-catalog'

export type FallbackBindingLimits = {
  assessmentRecords: PlanLimit
  assessments: PlanLimit
  origins: PlanLimit
}

const multiplyLimit = (value: PlanLimit, multiplier: number): PlanLimit =>
  value === 'unlimited' ? value : value * multiplier

const addLimits = (left: PlanLimit, right: PlanLimit): PlanLimit =>
  left === 'unlimited' || right === 'unlimited' ? 'unlimited' : left + right

const minimumLimit = (left: PlanLimit, right: PlanLimit): PlanLimit => {
  if (left === 'unlimited') return right
  if (right === 'unlimited') return left
  return Math.min(left, right)
}

/**
 * Fallback safety records are derived infrastructure, rather than billable
 * product resources. Their caps therefore track the resources that can
 * reference them without adding another persisted plan-contract field.
 */
export function fallbackBindingLimitsForPlan(plan: PlanDefinition): FallbackBindingLimits {
  const appScaledOrigins = multiplyLimit(plan.limits.apps, 5)
  const originAllowance =
    appScaledOrigins === 'unlimited' ? appScaledOrigins : Math.max(5, appScaledOrigins)

  return {
    assessments: addLimits(plan.limits.savedLinks, plan.limits.apps),
    assessmentRecords: addLimits(
      addLimits(plan.limits.savedLinks, plan.limits.apps),
      minimumLimit(plan.limits.savedLinks, originAllowance),
    ),
    origins: minimumLimit(plan.limits.savedLinks, originAllowance),
  }
}

export function isFallbackBindingLimitReached(limit: PlanLimit, used: number): boolean {
  return limit !== 'unlimited' && Math.max(0, Math.floor(used)) >= limit
}
