import 'server-only'

import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { getLinksetGoEdition } from './deployment-edition'
import { resolveOrganizationPlan } from './billing-plan'
import { relationID } from './tenant-context'

const relationshipInput = (id: string): number | string => (/^\d+$/.test(id) ? Number(id) : id)

export type ResolutionMeteringResult = {
  allowDetailedAnalytics: boolean
  count: number | null
  limit: number | 'unlimited'
}

export function monthlyUsagePeriodStart(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

async function organizationForApp(payload: Payload, appID: number | string): Promise<number> {
  const app = await payload.findByID({
    collection: 'apps',
    id: appID,
    depth: 0,
    overrideAccess: true,
  })
  const workspaceID = relationID(app.workspace)
  if (!workspaceID) throw new Error('Cannot meter an app without a workspace.')

  const workspace = await payload.findByID({
    collection: 'workspaces',
    id: relationshipInput(workspaceID),
    depth: 0,
    overrideAccess: true,
  })
  const organizationID = relationID(workspace.organization)
  if (!organizationID) throw new Error('Cannot meter a workspace without an organization.')
  const numericOrganizationID = Number(organizationID)
  if (!Number.isSafeInteger(numericOrganizationID) || numericOrganizationID <= 0) {
    throw new Error('Cannot meter an invalid organization.')
  }
  return numericOrganizationID
}

const resultCount = (row: unknown): number => {
  const value =
    typeof row === 'object' && row !== null && Object.hasOwn(row, 'count')
      ? (row as Record<string, unknown>).count
      : null
  const count = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(count) || count < 0) throw new Error('Usage meter returned invalid data.')
  return Math.floor(count)
}

export async function meterResolvedApp(
  payload: Payload,
  appID: number | string,
  now: Date = new Date(),
): Promise<ResolutionMeteringResult> {
  if (getLinksetGoEdition() === 'community') {
    return { allowDetailedAnalytics: true, count: null, limit: 'unlimited' }
  }

  const organizationID = await organizationForApp(payload, appID)
  const plan = await resolveOrganizationPlan(payload, organizationID, { edition: 'cloud', now })
  const limit = plan.plan.limits.monthlyResolutions
  if (limit === 'unlimited') {
    return { allowDetailedAnalytics: true, count: null, limit }
  }

  const adapter = payload.db as unknown as PostgresAdapter
  const instant = now.toISOString()
  const result = await adapter.drizzle.execute(sql`
    INSERT INTO "usage_counters"
      ("organization_id", "metric", "period_start", "count", "updated_at", "created_at")
    VALUES
      (${organizationID}, 'monthly-resolutions', ${monthlyUsagePeriodStart(now)}, 1, ${instant}, ${instant})
    ON CONFLICT ("organization_id", "metric", "period_start")
    DO UPDATE SET
      "count" = "usage_counters"."count" + 1,
      "updated_at" = EXCLUDED."updated_at"
    WHERE "usage_counters"."count" <= ${limit}
    RETURNING "count"
  `)
  const count = result.rows.length === 0 ? limit + 1 : resultCount(result.rows[0] as unknown)
  return { allowDetailedAnalytics: count <= limit, count, limit }
}

export async function canRecordDetailedAnalytics(
  payload: Payload,
  appID: number | string,
  now: Date = new Date(),
): Promise<boolean> {
  if (getLinksetGoEdition() === 'community') return true
  const organizationID = await organizationForApp(payload, appID)
  const plan = await resolveOrganizationPlan(payload, organizationID, { edition: 'cloud', now })
  const limit = plan.plan.limits.monthlyResolutions
  if (limit === 'unlimited') return true

  const usage = await payload.find({
    collection: 'usage-counters',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    where: {
      and: [
        { organization: { equals: organizationID } },
        { metric: { equals: 'monthly-resolutions' } },
        { periodStart: { equals: monthlyUsagePeriodStart(now) } },
      ],
    },
  })
  return (usage.docs[0]?.count ?? 0) <= limit
}
