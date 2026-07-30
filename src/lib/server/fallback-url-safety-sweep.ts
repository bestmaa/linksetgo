import 'server-only'

import { randomBytes, timingSafeEqual } from 'node:crypto'

import {
  commitTransaction,
  createLocalReq,
  initTransaction,
  killTransaction,
  type Payload,
  type PayloadRequest,
} from 'payload'

import type {
  URLSafetyProvider,
  URLSafetyProviderResult,
} from '@/lib/application/url-safety-provider'
import {
  beginFallbackURLSafetyAssessment,
  completeFallbackURLSafetyAssessment,
} from '@/lib/domain/fallback-url-safety'
import {
  parsePersistedFallbackURLSafetyAssessment,
  type PersistedFallbackURLSafetyAssessment,
} from './fallback-url-safety-service'
import { hasLiveFallbackURLReference } from './fallback-binding-references'
import { acquireTransactionLock } from './postgres-lock'

type EnvironmentSource = Readonly<Record<string, string | undefined>>

export type FallbackURLSafetySweepConfiguration =
  | { status: 'disabled' }
  | { message: string; status: 'misconfigured' }
  | { batchSize: number; secret: string; status: 'ready' }

export type FallbackURLSafetySweepSummary = {
  candidates: number
  claimed: number
  errors: number
  invalid: number
  lostClaims: number
  orphaned: number
  safe: number
  unsafe: number
}

export type FallbackURLSafetySweepTransactions = {
  acquireLock(req: PayloadRequest, assessmentID: string): Promise<void>
  acquireReferenceLock(req: PayloadRequest, referenceKey: string): Promise<void>
  commit(req: PayloadRequest): Promise<void>
  createRequest(payload: Payload): Promise<PayloadRequest>
  init(req: PayloadRequest): Promise<boolean>
  rollback(req: PayloadRequest): Promise<void>
}

type SweepCandidate = PersistedFallbackURLSafetyAssessment & {
  claimExpiresAt: null | string
  claimToken: null | string
}

type InternalSweepStore = {
  delete(input: {
    collection: 'fallback-url-safety-assessments'
    depth: 0
    id: number | string
    overrideAccess: true
    req: PayloadRequest
  }): Promise<unknown>
  find(input: {
    collection: 'fallback-url-safety-assessments'
    depth: 0
    limit: number
    overrideAccess: true
    pagination: false
    sort: string
    where: Record<string, unknown>
  }): Promise<{ docs: unknown[] }>
  findByID(input: {
    collection: 'fallback-url-safety-assessments'
    depth: 0
    id: number | string
    overrideAccess: true
    req: PayloadRequest
  }): Promise<unknown>
  update(input: {
    collection: 'fallback-url-safety-assessments'
    data: Record<string, unknown>
    depth: 0
    id: number | string
    overrideAccess: true
    req: PayloadRequest
  }): Promise<unknown>
}

const defaultBatchSize = 20
const maximumBatchSize = 50
const claimLeaseMilliseconds = 3 * 60 * 1_000
const errorRetryMilliseconds = 15 * 60 * 1_000
const parallelism = 5

const defaultTransactions: FallbackURLSafetySweepTransactions = {
  acquireLock: (req, assessmentID) =>
    acquireTransactionLock(req, 'fallback-url-safety-assessment', assessmentID),
  acquireReferenceLock: (req, referenceKey) =>
    acquireTransactionLock(req, 'fallback-binding-reference', referenceKey),
  commit: commitTransaction,
  createRequest: (payload) => createLocalReq({}, payload),
  init: initTransaction,
  rollback: killTransaction,
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const optionalInstant = (value: unknown): null | string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : null

function parseCandidate(value: unknown): SweepCandidate | null {
  try {
    const assessment = parsePersistedFallbackURLSafetyAssessment(value)
    if (!isRecord(value)) return null
    const claimToken =
      typeof value.claimToken === 'string' && value.claimToken.length <= 128
        ? value.claimToken
        : null
    return {
      ...assessment,
      claimExpiresAt: optionalInstant(value.claimExpiresAt),
      claimToken,
    }
  } catch {
    return null
  }
}

function parseBatchSize(value: string | undefined): number | null {
  if (!value?.trim()) return defaultBatchSize
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= maximumBatchSize ? parsed : null
}

export function getFallbackURLSafetySweepConfiguration(
  environment: EnvironmentSource = process.env,
): FallbackURLSafetySweepConfiguration {
  const configuredSecret = environment.FALLBACK_URL_SAFETY_SWEEP_SECRET
  if (configuredSecret === undefined || configuredSecret.trim() === '') {
    return { status: 'disabled' }
  }
  const secret = configuredSecret.trim()
  if (secret.length < 32 || secret.length > 1_024 || /[\u0000-\u001f\u007f]/.test(secret)) {
    return {
      message: 'FALLBACK_URL_SAFETY_SWEEP_SECRET must contain 32 to 1024 safe characters.',
      status: 'misconfigured',
    }
  }
  const batchSize = parseBatchSize(environment.FALLBACK_URL_SAFETY_SWEEP_BATCH_SIZE)
  if (batchSize === null) {
    return {
      message: `FALLBACK_URL_SAFETY_SWEEP_BATCH_SIZE must be between 1 and ${maximumBatchSize}.`,
      status: 'misconfigured',
    }
  }
  return { batchSize, secret, status: 'ready' }
}

export function authorizeFallbackURLSafetySweep(
  authorization: string | null,
  expectedSecret: string,
): boolean {
  const match = /^Bearer ([^\s]+)$/.exec(authorization ?? '')
  if (!match) return false
  const supplied = Buffer.from(match[1]!, 'utf8')
  const expected = Buffer.from(expectedSecret, 'utf8')
  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
}

function isEligible(candidate: SweepCandidate, now: Date): boolean {
  if (candidate.status === 'pending') return true
  if (candidate.status === 'error') {
    return (
      candidate.checkedAt === null ||
      Date.parse(candidate.checkedAt) <= now.getTime() - errorRetryMilliseconds
    )
  }
  if (candidate.status === 'safe' || candidate.status === 'unsafe') {
    return candidate.expiresAt === null || Date.parse(candidate.expiresAt) <= now.getTime()
  }
  return candidate.claimExpiresAt === null || Date.parse(candidate.claimExpiresAt) <= now.getTime()
}

async function withAssessmentLock<T>(input: {
  action(req: PayloadRequest): Promise<T>
  assessmentID: number | string
  payload: Payload
  transactions: FallbackURLSafetySweepTransactions
}): Promise<{ ok: false } | { ok: true; value: T }> {
  const req = await input.transactions.createRequest(input.payload)
  if (!(await input.transactions.init(req))) return { ok: false }
  try {
    await input.transactions.acquireLock(req, String(input.assessmentID))
    const value = await input.action(req)
    await input.transactions.commit(req)
    return { ok: true, value }
  } catch {
    await input.transactions.rollback(req).catch(() => undefined)
    return { ok: false }
  }
}

async function claimCandidate(input: {
  candidate: SweepCandidate
  claimToken: string
  now: Date
  payload: Payload
  store: InternalSweepStore
  transactions: FallbackURLSafetySweepTransactions
}): Promise<
  | { assessment: PersistedFallbackURLSafetyAssessment; kind: 'claimed' }
  | { kind: 'orphaned' }
  | null
> {
  const result = await withAssessmentLock({
    assessmentID: input.candidate.id,
    payload: input.payload,
    transactions: input.transactions,
    action: async (req) => {
      const current = parseCandidate(
        await input.store.findByID({
          collection: 'fallback-url-safety-assessments',
          depth: 0,
          id: input.candidate.id,
          overrideAccess: true,
          req,
        }),
      )
      if (!current || !isEligible(current, input.now)) return null
      await input.transactions.acquireReferenceLock(req, current.urlHash)
      if (
        !(await hasLiveFallbackURLReference({
          canonicalUrl: current.canonicalUrl,
          payload: input.payload,
          req,
          workspaceID: current.workspaceId,
        }))
      ) {
        await input.store.delete({
          collection: 'fallback-url-safety-assessments',
          depth: 0,
          id: current.id,
          overrideAccess: true,
          req,
        })
        return { kind: 'orphaned' as const }
      }
      return {
        assessment: parsePersistedFallbackURLSafetyAssessment(
          await input.store.update({
            collection: 'fallback-url-safety-assessments',
            data: {
              claimExpiresAt: new Date(input.now.getTime() + claimLeaseMilliseconds).toISOString(),
              claimToken: input.claimToken,
              lastAttemptAt: input.now.toISOString(),
              status: 'checking',
            },
            depth: 0,
            id: current.id,
            overrideAccess: true,
            req,
          }),
        ),
        kind: 'claimed' as const,
      }
    },
  })
  return result.ok ? result.value : null
}

async function assessClaimWhileReferenced(input: {
  assessment: PersistedFallbackURLSafetyAssessment
  claimToken: string
  maxAgeMs: number
  now: Date
  payload: Payload
  provider: URLSafetyProvider
  store: InternalSweepStore
  transactions: FallbackURLSafetySweepTransactions
}): Promise<'error' | 'lost-claim' | 'orphaned' | 'safe' | 'unsafe'> {
  // Provider I/O must never hold a database transaction or advisory lock.
  // The claim token leases this exact assessment while the external check
  // runs; the short finalize transaction below rejects stale/lost claims.
  let completion: URLSafetyProviderResult
  try {
    completion = await input.provider.assessURL(input.assessment.canonicalUrl)
  } catch {
    completion = {
      kind: 'error',
      message: 'The URL safety provider is unavailable.',
      retryable: true,
    }
  }

  const result = await withAssessmentLock({
    assessmentID: input.assessment.id,
    payload: input.payload,
    transactions: input.transactions,
    action: async (req) => {
      await input.transactions.acquireReferenceLock(req, input.assessment.urlHash)
      const current = parseCandidate(
        await input.store.findByID({
          collection: 'fallback-url-safety-assessments',
          depth: 0,
          id: input.assessment.id,
          overrideAccess: true,
          req,
        }),
      )
      if (!current || current.status !== 'checking' || current.claimToken !== input.claimToken) {
        return 'lost-claim' as const
      }
      if (
        !(await hasLiveFallbackURLReference({
          canonicalUrl: current.canonicalUrl,
          payload: input.payload,
          req,
          workspaceID: current.workspaceId,
        }))
      ) {
        await input.store.delete({
          collection: 'fallback-url-safety-assessments',
          depth: 0,
          id: current.id,
          overrideAccess: true,
          req,
        })
        return 'orphaned' as const
      }

      const completed = completeFallbackURLSafetyAssessment({
        assessment: beginFallbackURLSafetyAssessment(current),
        completion:
          completion.kind === 'error' ? { kind: 'error', message: completion.message } : completion,
        maxAgeMs: input.maxAgeMs,
        now: input.now,
      })
      await input.store.update({
        collection: 'fallback-url-safety-assessments',
        data: {
          checkedAt: completed.checkedAt,
          claimExpiresAt: null,
          claimToken: null,
          expiresAt: completed.expiresAt,
          lastError: completed.lastError,
          providerObservedAt: completed.providerObservedAt,
          redirectCount: completed.redirectCount,
          status: completed.status,
          threats: [...completed.threats],
        },
        depth: 0,
        id: input.assessment.id,
        overrideAccess: true,
        req,
      })
      return completed.status === 'safe' || completed.status === 'unsafe'
        ? completed.status
        : 'error'
    },
  })
  return result.ok ? result.value : 'lost-claim'
}

async function processCandidate(input: {
  candidate: SweepCandidate
  maxAgeMs: number
  now: Date
  payload: Payload
  provider: URLSafetyProvider
  store: InternalSweepStore
  transactions: FallbackURLSafetySweepTransactions
}): Promise<'error' | 'lost-claim' | 'not-claimed' | 'orphaned' | 'safe' | 'unsafe'> {
  const claimToken = randomBytes(32).toString('hex')
  const claimed = await claimCandidate({
    candidate: input.candidate,
    claimToken,
    now: input.now,
    payload: input.payload,
    store: input.store,
    transactions: input.transactions,
  })
  if (!claimed) return 'not-claimed'
  if (claimed.kind === 'orphaned') return 'orphaned'

  return assessClaimWhileReferenced({
    assessment: claimed.assessment,
    claimToken,
    maxAgeMs: input.maxAgeMs,
    now: input.now,
    payload: input.payload,
    provider: input.provider,
    store: input.store,
    transactions: input.transactions,
  })
}

export async function sweepFallbackURLSafetyAssessments(input: {
  batchSize: number
  maxAgeMs: number
  now?: Date
  payload: Payload
  provider: URLSafetyProvider
  transactions?: FallbackURLSafetySweepTransactions
}): Promise<FallbackURLSafetySweepSummary> {
  const now = input.now ?? new Date()
  if (!Number.isFinite(now.getTime())) throw new Error('A valid sweep time is required.')
  const batchSize = Math.max(1, Math.min(maximumBatchSize, Math.floor(input.batchSize)))
  const nowISO = now.toISOString()
  const errorCutoff = new Date(now.getTime() - errorRetryMilliseconds).toISOString()
  const store = input.payload as unknown as InternalSweepStore
  const transactions = input.transactions ?? defaultTransactions
  const found = await store.find({
    collection: 'fallback-url-safety-assessments',
    depth: 0,
    limit: batchSize,
    overrideAccess: true,
    pagination: false,
    sort: 'updatedAt',
    where: {
      or: [
        { status: { equals: 'pending' } },
        {
          and: [
            { status: { equals: 'error' } },
            {
              or: [
                { checkedAt: { exists: false } },
                { checkedAt: { less_than_equal: errorCutoff } },
              ],
            },
          ],
        },
        {
          and: [
            { status: { in: ['safe', 'unsafe'] } },
            {
              or: [{ expiresAt: { exists: false } }, { expiresAt: { less_than_equal: nowISO } }],
            },
          ],
        },
        {
          and: [
            { status: { equals: 'checking' } },
            {
              or: [
                { claimExpiresAt: { exists: false } },
                { claimExpiresAt: { less_than_equal: nowISO } },
              ],
            },
          ],
        },
      ],
    },
  })
  const candidates = found.docs.map(parseCandidate)
  const validCandidates = candidates.filter((candidate): candidate is SweepCandidate => !!candidate)
  const summary: FallbackURLSafetySweepSummary = {
    candidates: found.docs.length,
    claimed: 0,
    errors: 0,
    invalid: found.docs.length - validCandidates.length,
    lostClaims: 0,
    orphaned: 0,
    safe: 0,
    unsafe: 0,
  }

  for (let offset = 0; offset < validCandidates.length; offset += parallelism) {
    const results = await Promise.all(
      validCandidates.slice(offset, offset + parallelism).map((candidate) =>
        processCandidate({
          candidate,
          maxAgeMs: input.maxAgeMs,
          now,
          payload: input.payload,
          provider: input.provider,
          store,
          transactions,
        }),
      ),
    )
    for (const result of results) {
      if (result === 'not-claimed') continue
      if (result === 'orphaned') {
        summary.orphaned += 1
        continue
      }
      summary.claimed += 1
      if (result === 'lost-claim') summary.lostClaims += 1
      else if (result === 'error') summary.errors += 1
      else if (result === 'safe') summary.safe += 1
      else summary.unsafe += 1
    }
  }
  return summary
}
