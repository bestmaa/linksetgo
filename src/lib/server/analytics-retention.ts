import 'server-only'

import type { Payload } from 'payload'

import { getRelayEdition } from './deployment-edition'
import { resolveOrganizationPlan } from './billing-plan'
import { relationID } from './tenant-context'

export const DEFAULT_COMMUNITY_ANALYTICS_RETENTION_DAYS = 90
export const MAX_ANALYTICS_RETENTION_DAYS = 3650

export function communityAnalyticsRetentionDays(
  configured = process.env.ANALYTICS_RETENTION_DAYS,
): number {
  if (!configured?.trim()) return DEFAULT_COMMUNITY_ANALYTICS_RETENTION_DAYS
  const days = Number(configured)
  if (!Number.isSafeInteger(days) || days < 1 || days > MAX_ANALYTICS_RETENTION_DAYS) {
    throw new Error(
      `ANALYTICS_RETENTION_DAYS must be an integer from 1 to ${MAX_ANALYTICS_RETENTION_DAYS}.`,
    )
  }
  return days
}

export async function analyticsRetentionDaysForOrganization(
  payload: Payload,
  organizationID: number | string,
): Promise<number> {
  if (getRelayEdition() === 'community') return communityAnalyticsRetentionDays()
  const resolution = await resolveOrganizationPlan(payload, organizationID, { edition: 'cloud' })
  const limit = resolution.plan.limits.analyticsRetentionDays
  if (limit === 'unlimited') return MAX_ANALYTICS_RETENTION_DAYS
  return limit
}

export async function analyticsRetentionDaysForWorkspace(
  payload: Payload,
  organization: unknown,
): Promise<number> {
  const organizationID = relationID(organization)
  if (!organizationID) throw new Error('The workspace has no analytics retention owner.')
  return analyticsRetentionDaysForOrganization(payload, organizationID)
}
