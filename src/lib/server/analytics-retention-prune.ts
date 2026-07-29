import 'server-only'

import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { getPlanDefinition } from '@/lib/domain/plan-catalog'
import { getLinksetGoEdition } from './deployment-edition'
import {
  analyticsRetentionDaysForOrganization,
  communityAnalyticsRetentionDays,
} from './analytics-retention'
import { getServerEnvironment } from './env'

export type AnalyticsPruneScope = {
  candidates: number
  cutoff: string
  deleted: number
  organizationID: string | null
  retentionDays: number
}

export type AnalyticsPruneReport = {
  dryRun: boolean
  scopes: AnalyticsPruneScope[]
  totalCandidates: number
  totalDeleted: number
}

type PruneOptions = {
  allowTestDatabase?: boolean
  dryRun?: boolean
  now?: Date
}

const countFromRow = (row: unknown): number => {
  const value =
    typeof row === 'object' && row !== null && 'count' in row
      ? (row as Record<string, unknown>).count
      : 0
  const count = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(count) || count < 0)
    throw new Error('Retention query returned invalid data.')
  return Math.floor(count)
}

function assertDatabaseSafety(allowTestDatabase: boolean): void {
  const databaseURL = getServerEnvironment().databaseURL
  const databaseName = decodeURIComponent(new URL(databaseURL).pathname).replace(/^\//, '')
  const looksLikeTest = process.env.NODE_ENV === 'test' || databaseName.endsWith('_test')
  if (looksLikeTest && !allowTestDatabase) {
    throw new Error('Refusing analytics retention work on a test database without explicit opt-in.')
  }
}

async function pruneScope(input: {
  adapter: PostgresAdapter
  cutoff: string
  dryRun: boolean
  organizationID: number | null
  retentionDays: number
}): Promise<AnalyticsPruneScope> {
  if (input.organizationID === null) {
    const candidatesResult = await input.adapter.drizzle.execute(sql`
      SELECT COUNT(*)::integer AS "count"
      FROM "link_events"
      WHERE "occurred_at" < ${input.cutoff}
    `)
    const candidates = countFromRow(candidatesResult.rows[0] as unknown)
    let deleted = 0
    if (!input.dryRun && candidates > 0) {
      const deletedResult = await input.adapter.drizzle.execute(sql`
        WITH deleted AS (
          DELETE FROM "link_events"
          WHERE "occurred_at" < ${input.cutoff}
          RETURNING 1
        )
        SELECT COUNT(*)::integer AS "count" FROM deleted
      `)
      deleted = countFromRow(deletedResult.rows[0] as unknown)
    }
    return {
      candidates,
      cutoff: input.cutoff,
      deleted,
      organizationID: null,
      retentionDays: input.retentionDays,
    }
  }
  const condition = sql`e."occurred_at" < ${input.cutoff}
      AND w."organization_id" = ${input.organizationID}`
  const candidatesResult = await input.adapter.drizzle.execute(sql`
    SELECT COUNT(*)::integer AS "count"
    FROM "link_events" e
    INNER JOIN "apps" a ON a."id" = e."app_id"
    INNER JOIN "workspaces" w ON w."id" = a."workspace_id"
    WHERE ${condition}
  `)
  const candidates = countFromRow(candidatesResult.rows[0] as unknown)
  let deleted = 0
  if (!input.dryRun && candidates > 0) {
    const deletedResult = await input.adapter.drizzle.execute(sql`
      WITH deleted AS (
        DELETE FROM "link_events" e
        USING "apps" a, "workspaces" w
        WHERE e."app_id" = a."id"
          AND a."workspace_id" = w."id"
          AND ${condition}
        RETURNING 1
      )
      SELECT COUNT(*)::integer AS "count" FROM deleted
    `)
    deleted = countFromRow(deletedResult.rows[0] as unknown)
  }
  return {
    candidates,
    cutoff: input.cutoff,
    deleted,
    organizationID: String(input.organizationID),
    retentionDays: input.retentionDays,
  }
}

async function pruneCloudOrphans(input: {
  adapter: PostgresAdapter
  cutoff: string
  dryRun: boolean
  retentionDays: number
}): Promise<AnalyticsPruneScope> {
  const candidatesResult = await input.adapter.drizzle.execute(sql`
    SELECT COUNT(*)::integer AS "count"
    FROM "link_events" e
    LEFT JOIN "apps" a ON a."id" = e."app_id"
    LEFT JOIN "workspaces" w ON w."id" = a."workspace_id"
    WHERE e."occurred_at" < ${input.cutoff}
      AND w."id" IS NULL
  `)
  const candidates = countFromRow(candidatesResult.rows[0] as unknown)
  let deleted = 0
  if (!input.dryRun && candidates > 0) {
    const deletedResult = await input.adapter.drizzle.execute(sql`
      WITH deleted AS (
        DELETE FROM "link_events" e
        WHERE e."occurred_at" < ${input.cutoff}
          AND NOT EXISTS (
            SELECT 1
            FROM "apps" a
            INNER JOIN "workspaces" w ON w."id" = a."workspace_id"
            WHERE a."id" = e."app_id"
          )
        RETURNING 1
      )
      SELECT COUNT(*)::integer AS "count" FROM deleted
    `)
    deleted = countFromRow(deletedResult.rows[0] as unknown)
  }
  return {
    candidates,
    cutoff: input.cutoff,
    deleted,
    organizationID: null,
    retentionDays: input.retentionDays,
  }
}

async function organizationIDs(payload: Payload): Promise<number[]> {
  const ids: number[] = []
  let page = 1
  while (true) {
    const result = await payload.find({
      collection: 'organizations',
      depth: 0,
      limit: 100,
      overrideAccess: true,
      page,
    })
    ids.push(...result.docs.map((organization) => organization.id))
    if (!result.hasNextPage) return ids
    page += 1
  }
}

export async function pruneExpiredLinkEvents(
  payload: Payload,
  options: PruneOptions = {},
): Promise<AnalyticsPruneReport> {
  const dryRun = options.dryRun ?? true
  assertDatabaseSafety(options.allowTestDatabase ?? false)
  const now = options.now ?? new Date()
  const adapter = payload.db as unknown as PostgresAdapter
  const scopes: AnalyticsPruneScope[] = []

  if (getLinksetGoEdition() === 'community') {
    const retentionDays = communityAnalyticsRetentionDays()
    scopes.push(
      await pruneScope({
        adapter,
        cutoff: new Date(now.getTime() - retentionDays * 86_400_000).toISOString(),
        dryRun,
        organizationID: null,
        retentionDays,
      }),
    )
  } else {
    for (const organizationID of await organizationIDs(payload)) {
      const retentionDays = await analyticsRetentionDaysForOrganization(payload, organizationID)
      scopes.push(
        await pruneScope({
          adapter,
          cutoff: new Date(now.getTime() - retentionDays * 86_400_000).toISOString(),
          dryRun,
          organizationID,
          retentionDays,
        }),
      )
    }
    const orphanRetention = getPlanDefinition('free').limits.analyticsRetentionDays
    if (orphanRetention === 'unlimited') {
      throw new Error('Cloud orphan analytics require a finite conservative retention policy.')
    }
    scopes.push(
      await pruneCloudOrphans({
        adapter,
        cutoff: new Date(now.getTime() - orphanRetention * 86_400_000).toISOString(),
        dryRun,
        retentionDays: orphanRetention,
      }),
    )
  }

  return {
    dryRun,
    scopes,
    totalCandidates: scopes.reduce((total, scope) => total + scope.candidates, 0),
    totalDeleted: scopes.reduce((total, scope) => total + scope.deleted, 0),
  }
}
