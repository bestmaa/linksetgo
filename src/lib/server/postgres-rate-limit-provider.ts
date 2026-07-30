import 'server-only'

import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import type { SQL } from 'drizzle-orm'

import type {
  RateLimitDecision,
  RateLimitProvider,
  RateLimitRequest,
} from '@/lib/application/rate-limit-provider'
import { getPayloadClient } from './payload-client'

type RateLimitDatabase = {
  execute(query: SQL): Promise<{ rows: unknown[] }>
}

type RateLimitRow = {
  count: number
  resetAt: string
}

type PairedRateLimitRow = {
  allowed: boolean
  remaining: number
  resetAt: string
}

const bucketPattern = /^[a-z0-9][a-z0-9-]{0,63}$/
const opaqueKeyPattern = /^[a-f0-9]{64}$/
const maximumWindowMs = 31 * 24 * 60 * 60 * 1_000
const maximumLimit = 1_000_000
const unavailableRetryMs = 60 * 1_000
const maximumPruneBatchSize = 10_000

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function parseRow(value: unknown): RateLimitRow | null {
  if (!isRecord(value)) return null
  const rawCount = value.count
  const count =
    typeof rawCount === 'number'
      ? rawCount
      : typeof rawCount === 'string'
        ? Number(rawCount)
        : Number.NaN
  const rawResetAt = value.reset_at
  const resetAt =
    rawResetAt instanceof Date
      ? rawResetAt
      : typeof rawResetAt === 'string'
        ? new Date(rawResetAt)
        : null
  if (
    !Number.isSafeInteger(count) ||
    count < 1 ||
    !resetAt ||
    !Number.isFinite(resetAt.getTime())
  ) {
    return null
  }
  return { count, resetAt: resetAt.toISOString() }
}

function parsePairedRow(value: unknown): PairedRateLimitRow | null {
  if (!isRecord(value) || typeof value.allowed !== 'boolean') return null
  const rawRemaining = value.remaining
  const remaining =
    typeof rawRemaining === 'number'
      ? rawRemaining
      : typeof rawRemaining === 'string'
        ? Number(rawRemaining)
        : Number.NaN
  const rawResetAt = value.reset_at
  const resetAt =
    rawResetAt instanceof Date
      ? rawResetAt
      : typeof rawResetAt === 'string'
        ? new Date(rawResetAt)
        : null
  if (
    !Number.isSafeInteger(remaining) ||
    remaining < 0 ||
    !resetAt ||
    !Number.isFinite(resetAt.getTime())
  ) {
    return null
  }
  return { allowed: value.allowed, remaining, resetAt: resetAt.toISOString() }
}

function validRequest(request: RateLimitRequest): boolean {
  const limit = Math.floor(request.limit)
  const windowMs = Math.floor(request.windowMs)
  return (
    bucketPattern.test(request.bucket) &&
    opaqueKeyPattern.test(request.key) &&
    Number.isSafeInteger(limit) &&
    limit >= 1 &&
    limit <= maximumLimit &&
    Number.isSafeInteger(windowMs) &&
    windowMs >= 1_000 &&
    windowMs <= maximumWindowMs
  )
}

async function defaultDatabase(): Promise<RateLimitDatabase> {
  const payload = await getPayloadClient()
  const adapter = payload.db as unknown as PostgresAdapter
  return adapter.drizzle as RateLimitDatabase
}

export async function pruneExpiredPostgresRateLimitWindows(
  input: {
    batchSize?: number
    database?: () => Promise<RateLimitDatabase>
  } = {},
): Promise<number> {
  const batchSize = Math.max(
    1,
    Math.min(maximumPruneBatchSize, Math.floor(input.batchSize ?? 1_000)),
  )
  const database = await (input.database ?? defaultDatabase)()
  const result = await database.execute(sql`
    WITH "doomed" AS (
      SELECT "ctid"
      FROM "linksetgo_rate_limit_windows"
      WHERE "reset_at" <= clock_timestamp() - interval '1 day'
      ORDER BY "reset_at"
      LIMIT ${batchSize}
    ),
    "deleted" AS (
      DELETE FROM "linksetgo_rate_limit_windows"
      WHERE "ctid" IN (SELECT "ctid" FROM "doomed")
      RETURNING 1
    )
    SELECT COUNT(*)::integer AS "deleted_count" FROM "deleted"
  `)
  const row = result.rows.length === 1 && isRecord(result.rows[0]) ? result.rows[0] : null
  const rawCount = row?.deleted_count
  const count =
    typeof rawCount === 'number'
      ? rawCount
      : typeof rawCount === 'string'
        ? Number(rawCount)
        : Number.NaN
  if (!Number.isSafeInteger(count) || count < 0 || count > batchSize) {
    throw new Error('The rate-limit pruning result was invalid.')
  }
  return count
}

/**
 * PostgreSQL-backed fixed windows coordinate every application replica. Keys
 * must already be privacy-safe hashes; neither email addresses nor client IPs
 * are persisted.
 */
export class PostgresRateLimitProvider implements RateLimitProvider {
  constructor(
    private readonly database: () => Promise<RateLimitDatabase> = defaultDatabase,
    private readonly now: () => number = Date.now,
  ) {}

  async consume(request: RateLimitRequest): Promise<RateLimitDecision> {
    const limit = Math.floor(request.limit)
    const windowMs = Math.floor(request.windowMs)
    if (!validRequest(request)) return this.unavailable()

    try {
      const database = await this.database()
      const result = await database.execute(sql`
        WITH "consumed" AS (
          INSERT INTO "linksetgo_rate_limit_windows"
            ("bucket", "key_hash", "count", "reset_at")
          VALUES (
            ${request.bucket},
            ${request.key},
            1,
            clock_timestamp() + (${windowMs} * interval '1 millisecond')
          )
          ON CONFLICT ("bucket", "key_hash") DO UPDATE SET
            "count" = CASE
              WHEN "linksetgo_rate_limit_windows"."reset_at" <= clock_timestamp() THEN 1
              ELSE LEAST("linksetgo_rate_limit_windows"."count" + 1, ${limit + 1})
            END,
            "reset_at" = CASE
              WHEN "linksetgo_rate_limit_windows"."reset_at" <= clock_timestamp()
                THEN clock_timestamp() + (${windowMs} * interval '1 millisecond')
              ELSE "linksetgo_rate_limit_windows"."reset_at"
            END
          WHERE
            "linksetgo_rate_limit_windows"."reset_at" <= clock_timestamp()
            OR "linksetgo_rate_limit_windows"."count" <= ${limit}
          RETURNING "count", "reset_at"
        )
        SELECT "count", "reset_at" FROM "consumed"
        UNION ALL
        SELECT "count", "reset_at"
        FROM "linksetgo_rate_limit_windows"
        WHERE
          "bucket" = ${request.bucket}
          AND "key_hash" = ${request.key}
          AND NOT EXISTS (SELECT 1 FROM "consumed")
        LIMIT 1
      `)
      const row = result.rows.length === 1 ? parseRow(result.rows[0]) : null
      if (!row) return this.unavailable()
      return {
        allowed: row.count <= limit,
        remaining: Math.max(0, limit - row.count),
        resetAt: row.resetAt,
      }
    } catch {
      return this.unavailable()
    }
  }

  async consumePair(first: RateLimitRequest, second: RateLimitRequest): Promise<RateLimitDecision> {
    if (
      !validRequest(first) ||
      !validRequest(second) ||
      (first.bucket === second.bucket && first.key === second.key)
    ) {
      return this.unavailable()
    }

    try {
      const database = await this.database()
      const result = await database.execute(sql`
        SELECT "allowed", "remaining", "reset_at"
        FROM "linksetgo_consume_rate_limit_pair"(
          ${first.bucket},
          ${first.key},
          ${Math.floor(first.limit)},
          ${Math.floor(first.windowMs)},
          ${second.bucket},
          ${second.key},
          ${Math.floor(second.limit)},
          ${Math.floor(second.windowMs)}
        )
      `)
      const row = result.rows.length === 1 ? parsePairedRow(result.rows[0]) : null
      return row ?? this.unavailable()
    } catch {
      return this.unavailable()
    }
  }

  private unavailable(): RateLimitDecision {
    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(this.now() + unavailableRetryMs).toISOString(),
    }
  }
}
