import type { Payload, PayloadRequest } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { fallbackURLAssessmentHash } from '@/lib/domain/fallback-url-safety'
import {
  authorizeFallbackURLSafetySweep,
  type FallbackURLSafetySweepTransactions,
  getFallbackURLSafetySweepConfiguration,
  sweepFallbackURLSafetyAssessments,
} from '@/lib/server/fallback-url-safety-sweep'

type StoredAssessment = Record<string, unknown> & { id: number }

function pendingAssessment(id: number): StoredAssessment {
  const canonicalUrl = `https://fallback.example/download-${id}`
  return {
    canonicalUrl,
    checkedAt: null,
    claimExpiresAt: null,
    claimToken: null,
    expiresAt: null,
    hostname: 'fallback.example',
    id,
    lastError: null,
    origin: 10,
    providerObservedAt: null,
    redirectCount: 0,
    status: 'pending',
    threats: [],
    updatedAt: '2026-07-30T09:00:00.000Z',
    urlHash: fallbackURLAssessmentHash('1', canonicalUrl),
    workspace: 1,
  }
}

class SweepPayload {
  readonly records: StoredAssessment[]
  findLimit = 0
  readonly referencedURLs: Set<string>

  constructor(records: StoredAssessment[], referencedURLs?: Iterable<string>) {
    this.records = records
    this.referencedURLs = new Set(
      referencedURLs ?? records.map((record) => String(record.canonicalUrl)),
    )
  }

  async delete(input: { id: number | string }): Promise<unknown> {
    const index = this.records.findIndex((record) => record.id === Number(input.id))
    if (index < 0) throw new Error('Assessment not found.')
    return this.records.splice(index, 1)[0]
  }

  async find(input: { collection: string; limit: number }): Promise<{
    docs: unknown[]
    hasNextPage?: boolean
    nextPage?: number | null
  }> {
    if (input.collection === 'apps') {
      return {
        docs: [{ fallbackUrl: null, id: 100, workspace: 1 }],
        hasNextPage: false,
        nextPage: null,
      }
    }
    if (input.collection === 'deep-links') {
      return {
        docs: [...this.referencedURLs].map((fallbackUrl, index) => ({
          app: 100,
          fallbackUrl,
          id: index + 1,
        })),
        hasNextPage: false,
        nextPage: null,
      }
    }
    this.findLimit = input.limit
    return { docs: this.records.slice(0, input.limit).map((record) => ({ ...record })) }
  }

  async findByID(input: { id: number | string }): Promise<unknown> {
    const record = this.records.find((candidate) => candidate.id === Number(input.id))
    if (!record) throw new Error('Assessment not found.')
    return { ...record }
  }

  async update(input: { data: Record<string, unknown>; id: number | string }): Promise<unknown> {
    const index = this.records.findIndex((record) => record.id === Number(input.id))
    if (index < 0) throw new Error('Assessment not found.')
    const updated = { ...this.records[index]!, ...input.data }
    this.records[index] = updated
    return { ...updated }
  }
}

class InMemoryTransactions implements FallbackURLSafetySweepTransactions {
  activeCount = 0
  private readonly active = new WeakSet<PayloadRequest>()
  private readonly lockIDs = new WeakMap<PayloadRequest, string[]>()
  private readonly locks = new Map<string, { locked: boolean; waiters: Array<() => void> }>()

  async acquireLock(req: PayloadRequest, assessmentID: string): Promise<void> {
    await this.acquire(req, `assessment:${assessmentID}`)
  }

  async acquireReferenceLock(req: PayloadRequest, referenceKey: string): Promise<void> {
    await this.acquire(req, `reference:${referenceKey}`)
  }

  private async acquire(req: PayloadRequest, lockID: string): Promise<void> {
    const lock = this.locks.get(lockID) ?? { locked: false, waiters: [] }
    this.locks.set(lockID, lock)
    if (lock.locked) {
      await new Promise<void>((resolve) => lock.waiters.push(resolve))
    } else {
      lock.locked = true
    }
    this.lockIDs.set(req, [...(this.lockIDs.get(req) ?? []), lockID])
  }

  async commit(req: PayloadRequest): Promise<void> {
    this.release(req)
    this.finish(req)
  }

  async createRequest(): Promise<PayloadRequest> {
    return {} as PayloadRequest
  }

  async init(req: PayloadRequest): Promise<boolean> {
    this.active.add(req)
    this.activeCount += 1
    return true
  }

  async rollback(req: PayloadRequest): Promise<void> {
    this.release(req)
    this.finish(req)
  }

  private finish(req: PayloadRequest): void {
    if (!this.active.has(req)) return
    this.active.delete(req)
    this.activeCount -= 1
  }

  private release(req: PayloadRequest): void {
    const lockIDs = this.lockIDs.get(req)
    if (!lockIDs) return
    this.lockIDs.delete(req)
    for (const lockID of lockIDs.reverse()) {
      const lock = this.locks.get(lockID)
      const next = lock?.waiters.shift()
      if (next) next()
      else if (lock) lock.locked = false
    }
  }
}

const safeProvider = {
  assessURL: vi.fn(async () => ({
    kind: 'safe' as const,
    observedAt: '2026-07-30T10:00:00.000Z',
    redirectCount: 0,
  })),
}

describe('durable fallback URL safety sweep', () => {
  it('requires a bounded configuration and constant-time bearer credential check', () => {
    expect(getFallbackURLSafetySweepConfiguration({})).toEqual({ status: 'disabled' })
    expect(
      getFallbackURLSafetySweepConfiguration({
        FALLBACK_URL_SAFETY_SWEEP_SECRET: 'short',
      }),
    ).toMatchObject({ status: 'misconfigured' })
    expect(
      getFallbackURLSafetySweepConfiguration({
        FALLBACK_URL_SAFETY_SWEEP_BATCH_SIZE: '51',
        FALLBACK_URL_SAFETY_SWEEP_SECRET: 's'.repeat(32),
      }),
    ).toMatchObject({ status: 'misconfigured' })

    const secret = 's'.repeat(32)
    expect(authorizeFallbackURLSafetySweep(`Bearer ${secret}`, secret)).toBe(true)
    expect(authorizeFallbackURLSafetySweep(`Bearer ${'x'.repeat(32)}`, secret)).toBe(false)
    expect(authorizeFallbackURLSafetySweep(null, secret)).toBe(false)
  })

  it('atomically claims a pending row across overlapping workers', async () => {
    safeProvider.assessURL.mockClear()
    const store = new SweepPayload([pendingAssessment(1)])
    const transactions = new InMemoryTransactions()
    const input = {
      batchSize: 20,
      maxAgeMs: 60 * 60 * 1_000,
      now: new Date('2026-07-30T10:00:00.000Z'),
      payload: store as unknown as Payload,
      provider: safeProvider,
      transactions,
    }
    const [first, second] = await Promise.all([
      sweepFallbackURLSafetyAssessments(input),
      sweepFallbackURLSafetyAssessments(input),
    ])

    expect(first.claimed + second.claimed).toBe(1)
    expect(safeProvider.assessURL).toHaveBeenCalledTimes(1)
    expect(store.records[0]).toMatchObject({
      claimExpiresAt: null,
      claimToken: null,
      expiresAt: '2026-07-30T11:00:00.000Z',
      status: 'safe',
    })
  })

  it('recovers an expired checking lease and persists provider errors fail-closed', async () => {
    const record = {
      ...pendingAssessment(1),
      claimExpiresAt: '2026-07-30T09:59:00.000Z',
      claimToken: 'abandoned-claim',
      status: 'checking',
    }
    const store = new SweepPayload([record])
    const summary = await sweepFallbackURLSafetyAssessments({
      batchSize: 20,
      maxAgeMs: 60 * 60 * 1_000,
      now: new Date('2026-07-30T10:00:00.000Z'),
      payload: store as unknown as Payload,
      provider: {
        assessURL: async () => ({
          kind: 'error',
          message: 'Provider unavailable.',
          retryable: true,
        }),
      },
      transactions: new InMemoryTransactions(),
    })

    expect(summary).toMatchObject({ claimed: 1, errors: 1 })
    expect(store.records[0]).toMatchObject({
      checkedAt: '2026-07-30T10:00:00.000Z',
      claimExpiresAt: null,
      claimToken: null,
      expiresAt: null,
      status: 'error',
    })
  })

  it('calls the external scanner only after the claim transaction commits', async () => {
    const store = new SweepPayload([pendingAssessment(1)])
    const transactions = new InMemoryTransactions()
    const assessURL = vi.fn(async () => {
      expect(transactions.activeCount).toBe(0)
      return {
        kind: 'safe' as const,
        observedAt: '2026-07-30T10:00:00.000Z',
        redirectCount: 1,
      }
    })

    await expect(
      sweepFallbackURLSafetyAssessments({
        batchSize: 1,
        maxAgeMs: 60 * 60 * 1_000,
        now: new Date('2026-07-30T10:00:00.000Z'),
        payload: store as unknown as Payload,
        provider: { assessURL },
        transactions,
      }),
    ).resolves.toMatchObject({ safe: 1 })
    expect(assessURL).toHaveBeenCalledOnce()
    expect(transactions.activeCount).toBe(0)
  })

  it('deletes an unreferenced assessment without invoking the provider', async () => {
    safeProvider.assessURL.mockClear()
    const store = new SweepPayload([pendingAssessment(1)], [])
    const summary = await sweepFallbackURLSafetyAssessments({
      batchSize: 20,
      maxAgeMs: 60 * 60 * 1_000,
      now: new Date('2026-07-30T10:00:00.000Z'),
      payload: store as unknown as Payload,
      provider: safeProvider,
      transactions: new InMemoryTransactions(),
    })

    expect(summary).toMatchObject({ claimed: 0, orphaned: 1 })
    expect(store.records).toHaveLength(0)
    expect(safeProvider.assessURL).not.toHaveBeenCalled()
  })

  it('clamps direct callers to the hard batch ceiling', async () => {
    safeProvider.assessURL.mockClear()
    const store = new SweepPayload(
      Array.from({ length: 55 }, (_, index) => pendingAssessment(index + 1)),
    )
    const summary = await sweepFallbackURLSafetyAssessments({
      batchSize: 500,
      maxAgeMs: 60 * 60 * 1_000,
      now: new Date('2026-07-30T10:00:00.000Z'),
      payload: store as unknown as Payload,
      provider: safeProvider,
      transactions: new InMemoryTransactions(),
    })

    expect(store.findLimit).toBe(50)
    expect(summary).toMatchObject({ candidates: 50, claimed: 50, safe: 50 })
    expect(safeProvider.assessURL).toHaveBeenCalledTimes(50)
  })
})
