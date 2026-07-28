import 'server-only'

import type { Payload } from 'payload'

import { getPlanUsageState } from '@/lib/domain/plan-catalog'
import type { BillingSummaryDTO } from '@/lib/client/payload-types'
import type { User } from '@/payload-types'
import { resolveOrganizationPlan } from './billing-plan'
import { getRelayEdition } from './deployment-edition'
import { monthlyUsagePeriodStart } from './resolution-metering'
import { relationID } from './tenant-context'

const numericID = (value: string): number | null => {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

export async function getBillingSummary(
  payload: Payload,
  user: User,
  workspaceID: string,
  now: Date = new Date(),
): Promise<BillingSummaryDTO | null> {
  const workspaceIdentifier = numericID(workspaceID)
  if (!workspaceIdentifier) return null

  const workspaces = await payload.find({
    collection: 'workspaces',
    depth: 0,
    limit: 1,
    overrideAccess: false,
    pagination: false,
    user,
    where: { id: { equals: workspaceIdentifier } },
  })
  const organizationID = relationID(workspaces.docs[0]?.organization)
  if (!organizationID) return null

  const organizationIdentifier = numericID(organizationID)
  if (!organizationIdentifier) return null
  const resolution = await resolveOrganizationPlan(payload, organizationIdentifier, {
    now,
  })
  const usage = await payload.find({
    collection: 'usage-counters',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    where: {
      and: [
        { organization: { equals: organizationIdentifier } },
        { metric: { equals: 'monthly-resolutions' } },
        { periodStart: { equals: monthlyUsagePeriodStart(now) } },
      ],
    },
  })
  const used = usage.docs[0]?.count ?? 0
  const usageState = getPlanUsageState(resolution.plan, 'monthlyResolutions', used)
  const subscription = resolution.subscription

  return {
    access: {
      canCreate: resolution.access.canCreate,
      canResolve: resolution.access.canResolve,
      reason: resolution.access.reason,
    },
    edition: getRelayEdition(),
    plan: {
      key: resolution.plan.key,
      limits: resolution.plan.limits,
      name: resolution.plan.name,
      priceMonthlyMinor: resolution.plan.priceMonthlyMinor,
    },
    source: resolution.source,
    subscription: subscription
      ? {
          currentPeriodEnd: subscription.currentPeriodEnd ?? null,
          graceEndsAt: subscription.graceEndsAt ?? null,
          status: subscription.status,
        }
      : null,
    usage: {
      monthlyResolutions: {
        kind: usageState.kind,
        limit: resolution.plan.limits.monthlyResolutions,
        used,
      },
      periodStart: monthlyUsagePeriodStart(now),
    },
  }
}
