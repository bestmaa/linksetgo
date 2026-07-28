import 'server-only'

import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import type { AnalyticsQueryInput, AnalyticsSummaryDTO } from '@/lib/client/payload-types'
import type { User, Workspace } from '@/payload-types'
import { normalizeHostname } from '@/lib/domain/workspace-domain'
import { analyticsRetentionDaysForWorkspace } from './analytics-retention'

type AnalyticsResult =
  | { ok: true; value: AnalyticsSummaryDTO }
  | { code: 'INVALID_INPUT' | 'NOT_FOUND'; message: string; ok: false; status: 400 | 404 }

type ParsedQuery = {
  appID: number | null
  eventType: string | null
  from: Date
  hostname: string | null
  linkID: number | null
  platform: string | null
  to: Date
  wasClamped: boolean
}

const DAY_MS = 86_400_000
const datePattern = /^\d{4}-\d{2}-\d{2}$/
const eventTypes = new Set([
  'app-opened',
  'fallback-viewed',
  'open-app-clicked',
  'resolved',
  'store-clicked',
])
const platforms = new Set(['android', 'ios', 'unknown', 'web'])

const numericID = (value: string | undefined): number | null => {
  if (!value) return null
  const numberValue = Number(value)
  return Number.isSafeInteger(numberValue) && numberValue > 0 ? numberValue : null
}

const utcDay = (value: string | undefined): Date | null => {
  if (!value || !datePattern.test(value)) return null
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

const dayLabel = (value: Date): string => value.toISOString().slice(0, 10)

function parseQuery(
  input: AnalyticsQueryInput,
  retentionDays: number,
  now: Date,
): ParsedQuery | null {
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
  const requestedTo = input.to ? utcDay(input.to) : tomorrow
  const requestedFrom = input.from
    ? utcDay(input.from)
    : new Date(tomorrow.getTime() - Math.min(7, retentionDays) * DAY_MS)
  if (!requestedFrom || !requestedTo) return null
  const exclusiveTo = input.to ? new Date(requestedTo.getTime() + DAY_MS) : requestedTo
  const to = new Date(Math.min(exclusiveTo.getTime(), tomorrow.getTime()))
  const retentionStart = new Date(tomorrow.getTime() - retentionDays * DAY_MS)
  const from = new Date(Math.max(requestedFrom.getTime(), retentionStart.getTime()))
  if (from >= to) return null

  const appID = numericID(input.appId)
  const linkID = numericID(input.linkId)
  if ((input.appId && !appID) || (input.linkId && !linkID)) return null
  if (input.eventType && !eventTypes.has(input.eventType)) return null
  if (input.platform && !platforms.has(input.platform)) return null
  const hostname = input.hostname ? normalizeHostname(input.hostname) : null
  if (input.hostname && !hostname) return null

  return {
    appID,
    eventType: input.eventType || null,
    from,
    hostname,
    linkID,
    platform: input.platform || null,
    to,
    wasClamped: from.getTime() !== requestedFrom.getTime() || to < exclusiveTo,
  }
}

const countValue = (value: unknown): number => {
  const numberValue = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numberValue) && numberValue >= 0 ? Math.floor(numberValue) : 0
}

const textValue = (value: unknown): string => (typeof value === 'string' ? value : String(value))

function dimensions(
  rows: readonly unknown[],
  idKey: string,
  labelKey: string,
): AnalyticsSummaryDTO['apps'] {
  return rows.flatMap((row) => {
    if (typeof row !== 'object' || row === null) return []
    const record = row as Record<string, unknown>
    if (!(idKey in record) || !(labelKey in record)) return []
    return [
      {
        count: countValue(record.count),
        id: textValue(record[idKey]),
        label: textValue(record[labelKey]),
      },
    ]
  })
}

async function findScopedWorkspace(
  payload: Payload,
  user: User,
  workspaceID: string,
): Promise<Workspace | null> {
  const numericWorkspaceID = numericID(workspaceID)
  if (!numericWorkspaceID) return null
  const result = await payload.find({
    collection: 'workspaces',
    depth: 0,
    limit: 1,
    overrideAccess: false,
    pagination: false,
    user,
    where: { id: { equals: numericWorkspaceID } },
  })
  return result.docs[0] ?? null
}

export async function getAnalyticsSummary(
  payload: Payload,
  user: User,
  input: AnalyticsQueryInput,
  now = new Date(),
): Promise<AnalyticsResult> {
  const workspace = await findScopedWorkspace(payload, user, input.workspaceId)
  if (!workspace) {
    return {
      code: 'NOT_FOUND',
      message: 'Analytics are not available for the selected workspace.',
      ok: false,
      status: 404,
    }
  }
  const retentionDays = await analyticsRetentionDaysForWorkspace(payload, workspace.organization)
  const query = parseQuery(input, retentionDays, now)
  if (!query) {
    return {
      code: 'INVALID_INPUT',
      message: 'Choose a valid analytics range and filters.',
      ok: false,
      status: 400,
    }
  }

  const adapter = payload.db as unknown as PostgresAdapter
  const values = {
    appID: query.appID,
    eventType: query.eventType,
    from: query.from.toISOString(),
    hostname: query.hostname,
    linkID: query.linkID,
    platform: query.platform,
    to: query.to.toISOString(),
    workspaceID: workspace.id,
  }
  const where = sql`
    a."workspace_id" = ${values.workspaceID}
    AND e."occurred_at" >= ${values.from}
    AND e."occurred_at" < ${values.to}
    AND (${values.appID}::integer IS NULL OR e."app_id" = ${values.appID})
    AND (${values.linkID}::integer IS NULL OR e."link_id" = ${values.linkID})
    AND (${values.hostname}::text IS NULL OR e."hostname" = ${values.hostname})
    AND (${values.platform}::text IS NULL OR e."platform"::text = ${values.platform})
    AND (${values.eventType}::text IS NULL OR e."event_type"::text = ${values.eventType})
  `
  const [total, daily, apps, links, platformRows, eventRows, hostRows] = await Promise.all([
    adapter.drizzle.execute(sql`
      SELECT COUNT(*)::integer AS "count"
      FROM "link_events" e
      INNER JOIN "apps" a ON a."id" = e."app_id"
      WHERE ${where}
    `),
    adapter.drizzle.execute(sql`
      SELECT to_char(e."occurred_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS "date",
        COUNT(*)::integer AS "count"
      FROM "link_events" e
      INNER JOIN "apps" a ON a."id" = e."app_id"
      WHERE ${where}
      GROUP BY "date"
      ORDER BY "date"
    `),
    adapter.drizzle.execute(sql`
      SELECT a."id"::text AS "id", a."name" AS "label", COUNT(*)::integer AS "count"
      FROM "link_events" e
      INNER JOIN "apps" a ON a."id" = e."app_id"
      WHERE ${where}
      GROUP BY a."id", a."name"
      ORDER BY "count" DESC, a."name"
      LIMIT 100
    `),
    adapter.drizzle.execute(sql`
      SELECT l."id"::text AS "id", l."name" AS "label", COUNT(*)::integer AS "count"
      FROM "link_events" e
      INNER JOIN "apps" a ON a."id" = e."app_id"
      INNER JOIN "deep_links" l ON l."id" = e."link_id"
      WHERE ${where}
      GROUP BY l."id", l."name"
      ORDER BY "count" DESC, l."name"
      LIMIT 250
    `),
    adapter.drizzle.execute(sql`
      SELECT e."platform"::text AS "id", e."platform"::text AS "label",
        COUNT(*)::integer AS "count"
      FROM "link_events" e
      INNER JOIN "apps" a ON a."id" = e."app_id"
      WHERE ${where}
      GROUP BY e."platform"
      ORDER BY "count" DESC
    `),
    adapter.drizzle.execute(sql`
      SELECT e."event_type"::text AS "id", e."event_type"::text AS "label",
        COUNT(*)::integer AS "count"
      FROM "link_events" e
      INNER JOIN "apps" a ON a."id" = e."app_id"
      WHERE ${where}
      GROUP BY e."event_type"
      ORDER BY "count" DESC
    `),
    adapter.drizzle.execute(sql`
      SELECT COALESCE(e."hostname", 'unknown') AS "id",
        COALESCE(e."hostname", 'Unknown host') AS "label", COUNT(*)::integer AS "count"
      FROM "link_events" e
      INNER JOIN "apps" a ON a."id" = e."app_id"
      WHERE ${where}
      GROUP BY e."hostname"
      ORDER BY "count" DESC
      LIMIT 100
    `),
  ])

  const dailyRows = dimensions(daily.rows as unknown[], 'date', 'date').map((row) => ({
    count: row.count,
    date: row.id,
  }))
  const totalRow = total.rows[0] as unknown
  const totalEvents =
    typeof totalRow === 'object' && totalRow !== null
      ? countValue((totalRow as Record<string, unknown>).count)
      : 0
  return {
    ok: true,
    value: {
      apps: dimensions(apps.rows as unknown[], 'id', 'label'),
      daily: dailyRows,
      events: dimensions(eventRows.rows as unknown[], 'id', 'label'),
      hosts: dimensions(hostRows.rows as unknown[], 'id', 'label'),
      links: dimensions(links.rows as unknown[], 'id', 'label'),
      platforms: dimensions(platformRows.rows as unknown[], 'id', 'label'),
      range: {
        from: dayLabel(query.from),
        retentionDays,
        retentionStartsAt: dayLabel(
          new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) -
              retentionDays * DAY_MS,
          ),
        ),
        to: dayLabel(new Date(query.to.getTime() - DAY_MS)),
        wasClamped: query.wasClamped,
      },
      totalEvents,
    },
  }
}
