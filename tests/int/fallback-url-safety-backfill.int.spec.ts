import type { Payload, PayloadRequest } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { fallbackURLAssessmentHash } from '@/lib/domain/fallback-url-safety'
import {
  backfillFallbackURLSafetyRegistrations,
  type FallbackURLSafetyBackfillTransactions,
} from '@/lib/server/fallback-url-safety-backfill'
import type { User } from '@/payload-types'

type StoredRecord = Record<string, unknown> & { id: number }

type FindInput = {
  collection: string
  depth?: number
  limit: number
  page?: number
  where?: Record<string, unknown>
}

const actor = {
  email: 'operator@example.test',
  id: 99,
  name: 'Operator',
  role: 'super-admin',
  status: 'active',
} as User

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function equalityValue(where: unknown, field: string): unknown {
  if (!isRecord(where)) return undefined
  const direct = where[field]
  if (isRecord(direct) && Object.hasOwn(direct, 'equals')) return direct.equals
  const nested = where.and
  if (!Array.isArray(nested)) return undefined
  for (const candidate of nested) {
    const value = equalityValue(candidate, field)
    if (value !== undefined) return value
  }
  return undefined
}

function persistedAssessment(input: {
  id?: number
  originID: number
  status: 'pending' | 'safe' | 'unsafe'
  url: string
  workspaceID: number
}): StoredRecord {
  const checked = input.status === 'pending' ? null : '2026-07-30T10:00:00.000Z'
  return {
    canonicalUrl: input.url,
    checkedAt: checked,
    expiresAt: input.status === 'pending' ? null : '2026-07-30T11:00:00.000Z',
    hostname: new URL(input.url).hostname,
    id: input.id ?? 20,
    lastError: null,
    origin: input.originID,
    providerObservedAt: checked,
    redirectCount: 0,
    status: input.status,
    threats: input.status === 'unsafe' ? ['malware'] : [],
    urlHash: fallbackURLAssessmentHash(String(input.workspaceID), input.url),
    workspace: input.workspaceID,
  }
}

class BackfillPayload {
  readonly apps: StoredRecord[]
  readonly assessments: StoredRecord[]
  readonly deepLinks: StoredRecord[]
  readonly origins: StoredRecord[]
  readonly sourceLimits: number[] = []
  writes = 0

  constructor(input: {
    apps?: StoredRecord[]
    assessments?: StoredRecord[]
    deepLinks?: StoredRecord[]
    origins?: StoredRecord[]
  }) {
    this.apps = input.apps ?? []
    this.assessments = input.assessments ?? []
    this.deepLinks = input.deepLinks ?? []
    this.origins = input.origins ?? []
  }

  async create(input: { collection: string; data: Record<string, unknown> }): Promise<unknown> {
    this.writes += 1
    if (input.collection === 'fallback-origins') {
      const hostname = String(input.data.hostname)
      const workspace = input.data.workspace
      if (
        this.origins.some(
          (origin) => origin.hostname === hostname && origin.workspace === workspace,
        )
      ) {
        throw new Error('duplicate workspace hostname')
      }
      const origin = {
        ...input.data,
        id: this.origins.length + 10,
        verificationToken: 'generated-token',
      }
      this.origins.push(origin)
      return { ...origin }
    }
    if (input.collection === 'fallback-url-safety-assessments') {
      const hash = String(input.data.urlHash)
      if (this.assessments.some((assessment) => assessment.urlHash === hash)) {
        throw new Error('duplicate assessment')
      }
      const assessment = {
        ...input.data,
        id: this.assessments.length + 20,
      }
      this.assessments.push(assessment)
      return { ...assessment }
    }
    throw new Error('Unexpected create collection.')
  }

  async find(input: FindInput): Promise<{
    docs: unknown[]
    hasNextPage?: boolean
    nextPage?: null | number
  }> {
    if (input.collection === 'apps' || input.collection === 'deep-links') {
      this.sourceLimits.push(input.limit)
      const records = input.collection === 'apps' ? this.apps : this.deepLinks
      const page = input.page ?? 1
      const start = (page - 1) * input.limit
      const docs = records.slice(start, start + input.limit).map((record) => ({ ...record }))
      const hasNextPage = start + input.limit < records.length
      return { docs, hasNextPage, nextPage: hasNextPage ? page + 1 : null }
    }
    if (input.collection === 'fallback-origins') {
      const hostname = equalityValue(input.where, 'hostname')
      const workspace = equalityValue(input.where, 'workspace')
      return {
        docs: this.origins
          .filter((origin) => origin.hostname === hostname && origin.workspace === workspace)
          .map((origin) => ({ ...origin })),
      }
    }
    if (input.collection === 'fallback-url-safety-assessments') {
      const hash = equalityValue(input.where, 'urlHash')
      return {
        docs: this.assessments
          .filter((assessment) => assessment.urlHash === hash)
          .map((assessment) => ({ ...assessment })),
      }
    }
    throw new Error('Unexpected find collection.')
  }

  async findByID(input: { collection: string; id: number | string }): Promise<unknown> {
    const records = input.collection === 'apps' ? this.apps : this.origins
    const record = records.find((candidate) => String(candidate.id) === String(input.id))
    if (!record) throw new Error('Record not found.')
    return { ...record }
  }
}

class BackfillTransactions implements FallbackURLSafetyBackfillTransactions {
  private readonly lockKeys = new WeakMap<PayloadRequest, string>()
  private readonly locks = new Map<string, { locked: boolean; waiters: Array<() => void> }>()

  async acquireLock(req: PayloadRequest, hostname: string): Promise<void> {
    const lock = this.locks.get(hostname) ?? { locked: false, waiters: [] }
    this.locks.set(hostname, lock)
    if (lock.locked) await new Promise<void>((resolve) => lock.waiters.push(resolve))
    else lock.locked = true
    this.lockKeys.set(req, hostname)
  }

  async commit(req: PayloadRequest): Promise<void> {
    this.release(req)
  }

  async createRequest(payload: Payload, user: User): Promise<PayloadRequest> {
    return { payload, user } as PayloadRequest
  }

  async init(): Promise<boolean> {
    return true
  }

  async rollback(req: PayloadRequest): Promise<void> {
    this.release(req)
  }

  private release(req: PayloadRequest): void {
    const hostname = this.lockKeys.get(req)
    if (!hostname) return
    this.lockKeys.delete(req)
    const lock = this.locks.get(hostname)
    const next = lock?.waiters.shift()
    if (next) next()
    else if (lock) lock.locked = false
  }
}

describe('fallback URL safety legacy backfill', () => {
  it('defaults to a read-only paginated inventory and never fetches tenant URLs', async () => {
    const payload = new BackfillPayload({
      apps: [
        {
          fallbackUrl: 'https://Fallback.Example/download',
          id: 1,
          workspace: 1,
        },
        {
          fallbackUrl: 'https://fallback.example/download',
          id: 2,
          workspace: 1,
        },
        {
          fallbackUrl: 'http://fallback.example/not-https',
          id: 3,
          workspace: 1,
        },
        {
          fallbackUrl: 'https://unscoped.example/download',
          id: 4,
          workspace: null,
        },
      ],
      deepLinks: [
        {
          app: 1,
          fallbackUrl: 'https://fallback.example/offer',
          id: 10,
        },
      ],
    })
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const summary = await backfillFallbackURLSafetyRegistrations({
      pageSize: 1,
      payload: payload as unknown as Payload,
    })

    expect(summary).toMatchObject({
      appFallbacksFound: 4,
      appPagesScanned: 4,
      appsScanned: 4,
      apply: false,
      assessmentsToQueue: 2,
      deepLinkFallbacksFound: 1,
      deepLinkPagesScanned: 1,
      deepLinksScanned: 1,
      duplicateCandidates: 1,
      invalidURLs: 1,
      originsToCreate: 1,
      uniqueCandidates: 2,
      unscopedCandidates: 1,
    })
    expect(payload.sourceLimits.every((limit) => limit === 1)).toBe(true)
    expect(payload.writes).toBe(0)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(JSON.stringify(summary)).not.toContain('fallback.example')
    fetchSpy.mockRestore()
  })

  it('serializes overlapping apply runs and remains idempotent', async () => {
    const payload = new BackfillPayload({
      apps: [
        {
          fallbackUrl: 'https://fallback.example/download',
          id: 1,
          workspace: 1,
        },
      ],
    })
    const transactions = new BackfillTransactions()
    const options = {
      actor,
      apply: true,
      payload: payload as unknown as Payload,
      transactions,
    }

    const [first, second] = await Promise.all([
      backfillFallbackURLSafetyRegistrations(options),
      backfillFallbackURLSafetyRegistrations(options),
    ])

    expect(first.originsCreated + second.originsCreated).toBe(1)
    expect(first.assessmentsQueued + second.assessmentsQueued).toBe(1)
    expect(payload.origins).toHaveLength(1)
    expect(payload.origins[0]).toMatchObject({ status: 'pending', workspace: 1 })
    expect(payload.assessments).toHaveLength(1)
    expect(payload.assessments[0]).toMatchObject({ status: 'pending', workspace: 1 })

    const repeated = await backfillFallbackURLSafetyRegistrations(options)
    expect(repeated).toMatchObject({
      assessmentsExisting: 1,
      assessmentsQueued: 0,
      originsCreated: 0,
      originsExisting: 1,
    })
    expect(payload.origins).toHaveLength(1)
    expect(payload.assessments).toHaveLength(1)
  })

  it('registers the same hostname independently for two workspaces', async () => {
    const payload = new BackfillPayload({
      apps: [
        {
          fallbackUrl: 'https://shared.example/one',
          id: 1,
          workspace: 1,
        },
        {
          fallbackUrl: 'https://shared.example/two',
          id: 2,
          workspace: 2,
        },
      ],
    })

    const summary = await backfillFallbackURLSafetyRegistrations({
      payload: payload as unknown as Payload,
    })

    expect(summary).toMatchObject({
      assessmentsToQueue: 2,
      originsToCreate: 2,
      uniqueCandidates: 2,
    })
  })

  it('reuses verified ownership without resetting an existing unsafe verdict', async () => {
    const url = 'https://verified.example/download'
    const unsafe = persistedAssessment({
      originID: 10,
      status: 'unsafe',
      url,
      workspaceID: 1,
    })
    const payload = new BackfillPayload({
      apps: [{ fallbackUrl: url, id: 1, workspace: 1 }],
      assessments: [unsafe],
      origins: [
        {
          hostname: 'verified.example',
          id: 10,
          status: 'verified',
          verificationToken: 'token',
          workspace: 1,
        },
      ],
    })

    const summary = await backfillFallbackURLSafetyRegistrations({
      actor,
      apply: true,
      payload: payload as unknown as Payload,
      transactions: new BackfillTransactions(),
    })

    expect(summary).toMatchObject({
      assessmentsExisting: 1,
      assessmentsQueued: 0,
      originsCreated: 0,
      originsExisting: 1,
    })
    expect(payload.assessments[0]).toEqual(unsafe)
  })

  it('skips revoked origins and clamps direct callers to the hard page ceiling', async () => {
    const payload = new BackfillPayload({
      apps: [
        {
          fallbackUrl: 'https://revoked.example/download',
          id: 1,
          workspace: 1,
        },
      ],
      origins: [
        {
          hostname: 'revoked.example',
          id: 10,
          status: 'revoked',
          verificationToken: 'token',
          workspace: 1,
        },
      ],
    })

    const summary = await backfillFallbackURLSafetyRegistrations({
      pageSize: 500,
      payload: payload as unknown as Payload,
    })

    expect(summary).toMatchObject({
      assessmentsToQueue: 0,
      pageSize: 100,
      revokedOrigins: 1,
    })
    expect(payload.sourceLimits.every((limit) => limit <= 100)).toBe(true)
  })
})
