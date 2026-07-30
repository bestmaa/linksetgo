import { sql } from '@payloadcms/db-postgres'
import { APIError, type CollectionBeforeValidateHook, type PayloadRequest } from 'payload'

import {
  fallbackBindingLimitsForPlan,
  isFallbackBindingLimitReached,
  type FallbackBindingLimits,
} from '@/lib/domain/fallback-binding-limits'
import type { PlanDefinition } from '@/lib/domain/plan-catalog'
import { resolveOrganizationPlan } from './billing-plan'
import { getLinksetGoEdition } from './deployment-edition'
import { hasLiveFallbackHostnameReference } from './fallback-binding-references'
import { acquireTransactionLock, requiredTransaction } from './postgres-lock'
import { relationID } from './tenant-context'

type FallbackBindingResource = keyof FallbackBindingLimits

type BindingQuotaContext = {
  limits: FallbackBindingLimits
  organizationID: string
  plan: PlanDefinition
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const relationshipInput = (id: string): number | string => (/^\d+$/.test(id) ? Number(id) : id)

async function organizationForWorkspace(req: PayloadRequest, workspaceID: string): Promise<string> {
  const workspace = await req.payload.findByID({
    collection: 'workspaces',
    id: relationshipInput(workspaceID),
    depth: 0,
    overrideAccess: true,
    req,
  })
  const organizationID = relationID(workspace.organization)
  if (!organizationID) {
    throw new APIError('The selected workspace has no organization.', 400)
  }
  return organizationID
}

function usedCount(value: unknown): number {
  const raw = isRecord(value) && Object.hasOwn(value, 'used') ? value.used : null
  const used = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number.NaN
  if (!Number.isSafeInteger(used) || used < 0) {
    throw new APIError('Fallback safety quota usage could not be verified.', 503)
  }
  return used
}

async function countOrganizationBindings(
  req: PayloadRequest,
  organizationID: string,
  resource: FallbackBindingResource,
): Promise<number> {
  const transaction = await requiredTransaction(req)
  const organization = relationshipInput(organizationID)
  const result =
    resource === 'origins'
      ? await transaction.execute(
          sql<{ used: number }>`SELECT COUNT(*)::integer AS "used"
            FROM "fallback_origins" o
            INNER JOIN "workspaces" w ON w."id" = o."workspace_id"
            WHERE w."organization_id" = ${organization}`,
        )
      : resource === 'assessmentRecords'
        ? await transaction.execute(
            sql<{ used: number }>`SELECT COUNT(*)::integer AS "used"
              FROM "fallback_url_safety_assessments" a
              INNER JOIN "workspaces" w ON w."id" = a."workspace_id"
              WHERE w."organization_id" = ${organization}`,
          )
        : await transaction.execute(
            sql<{ used: number }>`SELECT COUNT(*)::integer AS "used"
              FROM "fallback_url_safety_assessments" a
              INNER JOIN "workspaces" w ON w."id" = a."workspace_id"
              WHERE w."organization_id" = ${organization}
                AND (
                  EXISTS (
                    SELECT 1
                    FROM "apps" app
                    WHERE app."workspace_id" = a."workspace_id"
                      AND app."fallback_url" = a."canonical_url"
                  )
                  OR EXISTS (
                    SELECT 1
                    FROM "deep_links" link
                    INNER JOIN "apps" app ON app."id" = link."app_id"
                    WHERE app."workspace_id" = a."workspace_id"
                      AND link."fallback_url" = a."canonical_url"
                  )
                )`,
          )
  return usedCount(result.rows[0])
}

async function bindingQuotaContext(
  req: PayloadRequest,
  workspaceID: string,
): Promise<BindingQuotaContext> {
  const organizationID = await organizationForWorkspace(req, workspaceID)
  await acquireTransactionLock(req, 'organization-fallback-binding-quota', organizationID)
  const resolution = await resolveOrganizationPlan(req.payload, relationshipInput(organizationID), {
    edition: 'cloud',
    req,
  })
  if (!resolution.access.canCreate) {
    throw new APIError('Your subscription currently blocks new resources.', 402)
  }
  return {
    limits: fallbackBindingLimitsForPlan(resolution.plan),
    organizationID,
    plan: resolution.plan,
  }
}

async function originHasProviderCostHistory(
  req: PayloadRequest,
  originID: number | string,
): Promise<boolean> {
  const result = await req.payload.find({
    collection: 'fallback-url-safety-assessments',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    req,
    where: {
      and: [
        { origin: { equals: originID } },
        {
          or: [
            { checkedAt: { exists: true } },
            { status: { in: ['checking', 'error', 'safe', 'unsafe'] } },
          ],
        },
      ],
    },
  })
  return result.docs.length > 0
}

async function reclaimUnusedOrigin(input: {
  limit: number
  organizationID: string
  req: PayloadRequest
}): Promise<boolean> {
  const workspaces = await input.req.payload.find({
    collection: 'workspaces',
    depth: 0,
    limit: Math.max(1, input.limit),
    overrideAccess: true,
    pagination: false,
    req: input.req,
    where: { organization: { equals: relationshipInput(input.organizationID) } },
  })
  const workspaceIDs = workspaces.docs.map(({ id }) => id)
  if (workspaceIDs.length === 0) return false

  const candidates = await input.req.payload.find({
    collection: 'fallback-origins',
    depth: 0,
    limit: Math.min(101, Math.max(1, input.limit + 1)),
    overrideAccess: true,
    pagination: false,
    req: input.req,
    sort: 'updatedAt',
    where: {
      and: [
        { workspace: { in: workspaceIDs } },
        { status: { in: ['pending', 'revoked', 'verified'] } },
      ],
    },
  })
  for (const candidate of candidates.docs) {
    const workspaceID = relationID(candidate.workspace)
    if (
      !workspaceID ||
      (await originHasProviderCostHistory(input.req, candidate.id)) ||
      (await hasLiveFallbackHostnameReference({
        hostname: candidate.hostname,
        payload: input.req.payload,
        req: input.req,
        workspaceID,
      }))
    ) {
      continue
    }
    await input.req.payload.delete({
      collection: 'fallback-origins',
      id: candidate.id,
      depth: 0,
      overrideAccess: true,
      req: input.req,
    })
    return true
  }
  return false
}

/**
 * A new exact URL consumes one live assessment slot. A same-workspace
 * replacement can release its previous URL in the same transaction, while a
 * small retained-record allowance caches paid provider verdicts and prevents
 * rapid unique-URL churn from becoming an unbounded scan path.
 */
export async function enforceFallbackAssessmentCapacity(input: {
  addsLiveAssessment: boolean
  createsRecord: boolean
  releasesLiveAssessment: boolean
  req: PayloadRequest
  workspaceID: number | string
}): Promise<void> {
  if (getLinksetGoEdition() === 'community') return
  const workspaceID = relationID(input.workspaceID)
  if (!workspaceID) throw new APIError('Select one valid workspace.', 400)
  const context = await bindingQuotaContext(input.req, workspaceID)

  if (input.addsLiveAssessment) {
    const liveUsed = await countOrganizationBindings(
      input.req,
      context.organizationID,
      'assessments',
    )
    const effectiveLiveUsed = Math.max(0, liveUsed - (input.releasesLiveAssessment ? 1 : 0))
    if (isFallbackBindingLimitReached(context.limits.assessments, effectiveLiveUsed)) {
      throw new APIError(
        `${context.plan.name} has reached its fallback URLs safety limit. Remove an unused fallback or upgrade.`,
        402,
      )
    }
  }

  if (input.createsRecord) {
    const recordsUsed = await countOrganizationBindings(
      input.req,
      context.organizationID,
      'assessmentRecords',
    )
    if (isFallbackBindingLimitReached(context.limits.assessmentRecords, recordsUsed)) {
      throw new APIError(
        `${context.plan.name} has reached its fallback URL safety-change limit. Reuse a recently checked URL, wait for cached checks to expire, or upgrade.`,
        402,
      )
    }
  }
}

export const enforceFallbackOriginPlanQuota: CollectionBeforeValidateHook = async ({
  data,
  operation,
  req,
}) => {
  if (getLinksetGoEdition() === 'community' || operation !== 'create') return data
  const next = isRecord(data) ? data : {}
  const workspaceID = relationID(next.workspace)
  if (!workspaceID) throw new APIError('A fallback origin requires a workspace.', 400)
  const context = await bindingQuotaContext(req, workspaceID)
  const limit = context.limits.origins
  let used = await countOrganizationBindings(req, context.organizationID, 'origins')

  while (
    typeof limit === 'number' &&
    isFallbackBindingLimitReached(limit, used) &&
    (await reclaimUnusedOrigin({
      limit,
      organizationID: context.organizationID,
      req,
    }))
  ) {
    used = await countOrganizationBindings(req, context.organizationID, 'origins')
  }
  if (isFallbackBindingLimitReached(limit, used)) {
    throw new APIError(
      `${context.plan.name} has reached its fallback hostnames safety limit. Remove an unused fallback or upgrade.`,
      402,
    )
  }
  return data
}
