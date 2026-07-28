import { sql } from '@payloadcms/db-postgres'
import { APIError, type CollectionBeforeValidateHook, type PayloadRequest } from 'payload'

import { canCreateResource, type PlanMetric } from '@/lib/domain/plan-catalog'
import { getRelayEdition } from './deployment-edition'
import { acquireTransactionLock, requiredTransaction } from './postgres-lock'
import { resolveOrganizationPlan } from './billing-plan'
import { relationID } from './tenant-context'

type CountedMetric = Extract<PlanMetric, 'activeLinks' | 'apps' | 'customDomains' | 'members'>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const selected = (
  data: Record<string, unknown>,
  original: Record<string, unknown>,
  field: string,
): unknown => (Object.hasOwn(data, field) ? data[field] : original[field])

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
  if (!organizationID) throw new APIError('The selected workspace has no organization.', 400)
  return organizationID
}

async function organizationForApp(req: PayloadRequest, appID: string): Promise<string> {
  const app = await req.payload.findByID({
    collection: 'apps',
    id: relationshipInput(appID),
    depth: 0,
    overrideAccess: true,
    req,
  })
  const workspaceID = relationID(app.workspace)
  if (!workspaceID) throw new APIError('The selected app has no workspace.', 400)
  return organizationForWorkspace(req, workspaceID)
}

async function countUsage(
  req: PayloadRequest,
  organizationID: string,
  metric: CountedMetric,
): Promise<number> {
  const db = await requiredTransaction(req)
  const query =
    metric === 'apps'
      ? sql<{ used: number }>`SELECT COUNT(*)::integer AS "used"
          FROM "apps" a
          INNER JOIN "workspaces" w ON w."id" = a."workspace_id"
          WHERE w."organization_id" = ${relationshipInput(organizationID)}`
      : metric === 'activeLinks'
        ? sql<{ used: number }>`SELECT COUNT(*)::integer AS "used"
            FROM "deep_links" l
            INNER JOIN "apps" a ON a."id" = l."app_id"
            INNER JOIN "workspaces" w ON w."id" = a."workspace_id"
            WHERE w."organization_id" = ${relationshipInput(organizationID)}
              AND l."status" = 'active'
              AND (l."expires_at" IS NULL OR l."expires_at" > NOW())`
        : metric === 'customDomains'
          ? sql<{ used: number }>`SELECT COUNT(*)::integer AS "used"
              FROM "domains" d
              INNER JOIN "workspaces" w ON w."id" = d."workspace_id"
              WHERE w."organization_id" = ${relationshipInput(organizationID)}
                AND d."type" = 'custom'`
          : sql<{ used: number }>`SELECT COUNT(*)::integer AS "used"
              FROM "organization_memberships" m
              WHERE m."organization_id" = ${relationshipInput(organizationID)}
                AND m."status" = 'active'`

  const result = await db.execute(query)
  const row = result.rows[0] as unknown
  const rawUsed =
    typeof row === 'object' && row !== null && Object.hasOwn(row, 'used')
      ? (row as Record<string, unknown>).used
      : null
  const used =
    typeof rawUsed === 'number'
      ? rawUsed
      : typeof rawUsed === 'string'
        ? Number(rawUsed)
        : Number.NaN
  if (!Number.isFinite(used) || used < 0) {
    throw new APIError('Quota usage could not be verified.', 503)
  }
  return Math.floor(used)
}

async function enforceQuota(
  req: PayloadRequest,
  organizationID: string,
  metric: CountedMetric,
): Promise<void> {
  if (getRelayEdition() === 'community') return

  await acquireTransactionLock(req, 'organization-quota', `${organizationID}:${metric}`)
  const resolution = await resolveOrganizationPlan(req.payload, relationshipInput(organizationID), {
    edition: 'cloud',
    req,
  })
  if (!resolution.access.canCreate) {
    throw new APIError('Your subscription currently blocks new resources.', 402)
  }

  const used = await countUsage(req, organizationID, metric)
  if (!canCreateResource(resolution.plan, metric, used)) {
    throw new APIError(
      `${resolution.plan.name} has reached its ${metric} limit. Upgrade or remove an existing resource.`,
      402,
    )
  }
}

export const enforceAppQuota: CollectionBeforeValidateHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (getRelayEdition() === 'community') return data
  const next = isRecord(data) ? data : {}
  const previous = isRecord(originalDoc) ? originalDoc : {}
  const workspaceID = relationID(selected(next, previous, 'workspace'))
  if (!workspaceID) throw new APIError('Cloud apps require a workspace.', 400)

  const organizationID = await organizationForWorkspace(req, workspaceID)
  const previousWorkspaceID = relationID(previous.workspace)
  const previousOrganizationID = previousWorkspaceID
    ? await organizationForWorkspace(req, previousWorkspaceID)
    : null
  if (operation === 'create' || organizationID !== previousOrganizationID) {
    await enforceQuota(req, organizationID, 'apps')
  }
  return data
}

export const enforceActiveLinkQuota: CollectionBeforeValidateHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (getRelayEdition() === 'community') return data
  const next = isRecord(data) ? data : {}
  const previous = isRecord(originalDoc) ? originalDoc : {}
  const nextStatus = selected(next, previous, 'status')
  const nextExpiry = selected(next, previous, 'expiresAt')
  const previousExpiry = previous.expiresAt
  const now = Date.now()
  const isEffectiveActive = (status: unknown, expiresAt: unknown): boolean =>
    status === 'active' &&
    (typeof expiresAt !== 'string' ||
      Number.isNaN(new Date(expiresAt).getTime()) ||
      new Date(expiresAt).getTime() > now)
  if (!isEffectiveActive(nextStatus, nextExpiry)) return data

  const appID = relationID(selected(next, previous, 'app'))
  if (!appID) throw new APIError('An active link requires an app.', 400)
  const organizationID = await organizationForApp(req, appID)
  const previousAppID = relationID(previous.app)
  const previousOrganizationID = previousAppID ? await organizationForApp(req, previousAppID) : null
  if (
    operation === 'create' ||
    !isEffectiveActive(previous.status, previousExpiry) ||
    organizationID !== previousOrganizationID
  ) {
    await enforceQuota(req, organizationID, 'activeLinks')
  }
  return data
}

export const enforceCustomDomainQuota: CollectionBeforeValidateHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (getRelayEdition() === 'community' || operation !== 'create') return data
  const next = isRecord(data) ? data : {}
  const previous = isRecord(originalDoc) ? originalDoc : {}
  if (selected(next, previous, 'type') !== 'custom') return data

  const workspaceID = relationID(selected(next, previous, 'workspace'))
  if (!workspaceID) throw new APIError('A custom domain requires a workspace.', 400)
  await enforceQuota(req, await organizationForWorkspace(req, workspaceID), 'customDomains')
  return data
}

export const enforceMemberQuota: CollectionBeforeValidateHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (getRelayEdition() === 'community') return data
  const next = isRecord(data) ? data : {}
  const previous = isRecord(originalDoc) ? originalDoc : {}
  if (
    selected(next, previous, 'status') !== 'active' ||
    (operation === 'update' && previous.status === 'active')
  ) {
    return data
  }

  const organizationID = relationID(selected(next, previous, 'organization'))
  if (!organizationID) throw new APIError('An active membership requires an organization.', 400)
  await enforceQuota(req, organizationID, 'members')
  return data
}
