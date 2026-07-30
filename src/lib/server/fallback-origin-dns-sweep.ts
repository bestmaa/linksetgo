import 'server-only'

import {
  commitTransaction,
  createLocalReq,
  initTransaction,
  killTransaction,
  type Payload,
  type PayloadRequest,
} from 'payload'

import type {
  DNSOwnershipEvidenceProvider,
  TXTEvidence,
} from '@/lib/application/dns-evidence-provider'
import { buildFallbackOriginInstructions } from '@/lib/domain/fallback-origin'
import { acquireTransactionLock } from './postgres-lock'
import {
  beginFallbackOriginReverification,
  fallbackOriginDNSFreshnessDefaults,
  reverifyFallbackOriginWithProvider,
} from './fallback-origin-lifecycle'

type EnvironmentSource = Readonly<Record<string, string | undefined>>

export type FallbackOriginDNSRefreshConfiguration =
  | { message: string; status: 'misconfigured' }
  | {
      batchSize: number
      evidenceMaxAgeMs: number
      outageGraceMs: number
      renewalLeadMs: number
      status: 'ready'
    }

export type FallbackOriginDNSRefreshSummary = {
  candidates: number
  errors: number
  evidenceRemoved: number
  graceActivated: number
  invalid: number
  renewed: number
  skipped: number
}

export type FallbackOriginDNSRefreshTransactions = {
  acquireLock(req: PayloadRequest, originID: string): Promise<void>
  commit(req: PayloadRequest): Promise<void>
  createRequest(payload: Payload): Promise<PayloadRequest>
  init(req: PayloadRequest): Promise<boolean>
  rollback(req: PayloadRequest): Promise<void>
}

type RefreshCandidate = {
  hostname: string
  id: number | string
  lastCheckedAt: null | string
  status: 'verified' | 'verifying'
  verificationToken: string
  verificationExpiresAt: null | string
}

type InternalOriginStore = {
  find(input: {
    collection: 'fallback-origins'
    depth: 0
    limit: number
    overrideAccess: true
    pagination: false
    sort: string
    where: Record<string, unknown>
  }): Promise<{ docs: unknown[] }>
  findByID(input: {
    collection: 'fallback-origins'
    depth: 0
    id: number | string
    overrideAccess: true
    req: PayloadRequest
  }): Promise<unknown>
}

const defaultBatchSize = 20
const maximumBatchSize = 50
const minimumEvidenceMaxAgeSeconds = 60 * 60
const maximumEvidenceMaxAgeSeconds = 7 * 24 * 60 * 60
const maximumOutageGraceSeconds = 24 * 60 * 60
const verificationLeaseMs = 15 * 60 * 1_000
const maximumRenewalLeadMs = 24 * 60 * 60 * 1_000
const parallelism = 3

const defaultTransactions: FallbackOriginDNSRefreshTransactions = {
  acquireLock: (req, originID) =>
    acquireTransactionLock(req, 'fallback-origin-dns-refresh', originID),
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

function parseCandidate(value: unknown): RefreshCandidate | null {
  if (!isRecord(value)) return null
  const id = value.id
  if (
    (typeof id !== 'number' && typeof id !== 'string') ||
    typeof value.hostname !== 'string' ||
    typeof value.verificationToken !== 'string' ||
    (value.status !== 'verified' && value.status !== 'verifying')
  ) {
    return null
  }
  return {
    hostname: value.hostname,
    id,
    lastCheckedAt: optionalInstant(value.lastCheckedAt),
    status: value.status,
    verificationToken: value.verificationToken,
    verificationExpiresAt: optionalInstant(value.verificationExpiresAt),
  }
}

function integerSetting(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number | null {
  if (!value?.trim()) return fallback
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null
}

export function getFallbackOriginDNSRefreshConfiguration(
  environment: EnvironmentSource = process.env,
): FallbackOriginDNSRefreshConfiguration {
  const evidenceMaxAgeSeconds = integerSetting(
    environment.FALLBACK_ORIGIN_DNS_EVIDENCE_MAX_AGE_SECONDS,
    fallbackOriginDNSFreshnessDefaults.evidenceMaxAgeMs / 1_000,
    minimumEvidenceMaxAgeSeconds,
    maximumEvidenceMaxAgeSeconds,
  )
  if (evidenceMaxAgeSeconds === null) {
    return {
      message: `FALLBACK_ORIGIN_DNS_EVIDENCE_MAX_AGE_SECONDS must be between ${minimumEvidenceMaxAgeSeconds} and ${maximumEvidenceMaxAgeSeconds}.`,
      status: 'misconfigured',
    }
  }
  const outageGraceSeconds = integerSetting(
    environment.FALLBACK_ORIGIN_DNS_OUTAGE_GRACE_SECONDS,
    fallbackOriginDNSFreshnessDefaults.outageGraceMs / 1_000,
    0,
    maximumOutageGraceSeconds,
  )
  if (outageGraceSeconds === null) {
    return {
      message: `FALLBACK_ORIGIN_DNS_OUTAGE_GRACE_SECONDS must be between 0 and ${maximumOutageGraceSeconds}.`,
      status: 'misconfigured',
    }
  }
  const batchSize = integerSetting(
    environment.FALLBACK_ORIGIN_DNS_SWEEP_BATCH_SIZE,
    defaultBatchSize,
    1,
    maximumBatchSize,
  )
  if (batchSize === null) {
    return {
      message: `FALLBACK_ORIGIN_DNS_SWEEP_BATCH_SIZE must be between 1 and ${maximumBatchSize}.`,
      status: 'misconfigured',
    }
  }
  const evidenceMaxAgeMs = evidenceMaxAgeSeconds * 1_000
  return {
    batchSize,
    evidenceMaxAgeMs,
    outageGraceMs: outageGraceSeconds * 1_000,
    renewalLeadMs: Math.min(60 * 60 * 1_000, Math.floor(evidenceMaxAgeMs / 4)),
    status: 'ready',
  }
}

function isEligible(candidate: RefreshCandidate, now: Date, renewalLeadMs: number): boolean {
  if (candidate.status === 'verified') {
    return (
      candidate.verificationExpiresAt === null ||
      Date.parse(candidate.verificationExpiresAt) <= now.getTime() + renewalLeadMs
    )
  }
  return (
    candidate.lastCheckedAt === null ||
    Date.parse(candidate.lastCheckedAt) <= now.getTime() - verificationLeaseMs
  )
}

async function processCandidate(input: {
  candidate: RefreshCandidate
  evidenceMaxAgeMs: number
  now: Date
  outageGraceMs: number
  payload: Payload
  provider: DNSOwnershipEvidenceProvider
  renewalLeadMs: number
  store: InternalOriginStore
  transactions: FallbackOriginDNSRefreshTransactions
}): Promise<'evidence-removed' | 'error' | 'grace' | 'renewed' | 'skipped'> {
  const claimRequest = await input.transactions.createRequest(input.payload)
  if (!(await input.transactions.init(claimRequest))) return 'error'
  let claim: RefreshCandidate | null = null
  try {
    await input.transactions.acquireLock(claimRequest, String(input.candidate.id))
    const current = parseCandidate(
      await input.store.findByID({
        collection: 'fallback-origins',
        depth: 0,
        id: input.candidate.id,
        overrideAccess: true,
        req: claimRequest,
      }),
    )
    if (!current || !isEligible(current, input.now, input.renewalLeadMs)) {
      await input.transactions.commit(claimRequest)
      return 'skipped'
    }

    const begun = await beginFallbackOriginReverification({
      id: current.id,
      now: input.now,
      payload: input.payload,
      req: claimRequest,
    })
    claim = begun.ok ? parseCandidate(begun.origin) : null
    await input.transactions.commit(claimRequest)
  } catch {
    await input.transactions.rollback(claimRequest).catch(() => undefined)
    return 'error'
  }
  if (!claim?.lastCheckedAt) return 'skipped'

  const instructions = buildFallbackOriginInstructions(claim)
  if (!instructions) return 'error'

  // DNS is external I/O. The short claim transaction above has committed, so
  // no database connection or advisory lock is held during the lookup.
  let evidence: TXTEvidence | null = null
  try {
    evidence = await input.provider.lookupTXT(instructions.name)
  } catch {
    evidence = null
  }

  const finalizeRequest = await input.transactions.createRequest(input.payload)
  if (!(await input.transactions.init(finalizeRequest))) return 'error'
  try {
    await input.transactions.acquireLock(finalizeRequest, String(claim.id))
    const current = parseCandidate(
      await input.store.findByID({
        collection: 'fallback-origins',
        depth: 0,
        id: claim.id,
        overrideAccess: true,
        req: finalizeRequest,
      }),
    )
    if (
      !current ||
      current.status !== 'verifying' ||
      current.lastCheckedAt !== claim.lastCheckedAt
    ) {
      await input.transactions.commit(finalizeRequest)
      return 'skipped'
    }

    const result = await reverifyFallbackOriginWithProvider({
      evidenceMaxAgeMs: input.evidenceMaxAgeMs,
      id: current.id,
      now: input.now,
      outageGraceMs: input.outageGraceMs,
      payload: input.payload,
      provider: {
        lookupTXT: async () => {
          if (!evidence) throw new Error('DNS provider unavailable.')
          return evidence
        },
      },
      req: finalizeRequest,
    })
    await input.transactions.commit(finalizeRequest)
    if (result.ok) return 'renewed'
    if (result.code === 'DNS_EVIDENCE_REJECTED') return 'evidence-removed'
    if (result.code === 'DNS_PROVIDER_UNAVAILABLE') {
      return result.origin.status === 'verified' ? 'grace' : 'error'
    }
    return 'skipped'
  } catch {
    await input.transactions.rollback(finalizeRequest).catch(() => undefined)
    return 'error'
  }
}

export async function sweepFallbackOriginDNSOwnership(input: {
  batchSize: number
  evidenceMaxAgeMs: number
  now?: Date
  outageGraceMs: number
  payload: Payload
  provider: DNSOwnershipEvidenceProvider
  renewalLeadMs: number
  transactions?: FallbackOriginDNSRefreshTransactions
}): Promise<FallbackOriginDNSRefreshSummary> {
  const now = input.now ?? new Date()
  if (!Number.isFinite(now.getTime())) throw new Error('A valid DNS refresh time is required.')
  const batchSize = Number.isFinite(input.batchSize)
    ? Math.max(1, Math.min(maximumBatchSize, Math.floor(input.batchSize)))
    : 1
  const renewalLeadMs = Number.isFinite(input.renewalLeadMs)
    ? Math.max(0, Math.min(maximumRenewalLeadMs, Math.floor(input.renewalLeadMs)))
    : 0
  const renewalCutoff = new Date(now.getTime() + renewalLeadMs).toISOString()
  const leaseCutoff = new Date(now.getTime() - verificationLeaseMs).toISOString()
  const store = input.payload as unknown as InternalOriginStore
  const found = await store.find({
    collection: 'fallback-origins',
    depth: 0,
    limit: batchSize,
    overrideAccess: true,
    pagination: false,
    sort: 'verificationExpiresAt',
    where: {
      or: [
        {
          and: [
            { status: { equals: 'verified' } },
            {
              or: [
                { verificationExpiresAt: { exists: false } },
                { verificationExpiresAt: { less_than_equal: renewalCutoff } },
              ],
            },
          ],
        },
        {
          and: [
            { status: { equals: 'verifying' } },
            {
              or: [
                { lastCheckedAt: { exists: false } },
                { lastCheckedAt: { less_than_equal: leaseCutoff } },
              ],
            },
          ],
        },
      ],
    },
  })
  const candidates = found.docs.map(parseCandidate)
  const valid = candidates.filter((candidate): candidate is RefreshCandidate => !!candidate)
  const summary: FallbackOriginDNSRefreshSummary = {
    candidates: found.docs.length,
    errors: 0,
    evidenceRemoved: 0,
    graceActivated: 0,
    invalid: found.docs.length - valid.length,
    renewed: 0,
    skipped: 0,
  }
  const transactions = input.transactions ?? defaultTransactions

  for (let offset = 0; offset < valid.length; offset += parallelism) {
    const results = await Promise.all(
      valid.slice(offset, offset + parallelism).map((candidate) =>
        processCandidate({
          candidate,
          evidenceMaxAgeMs: input.evidenceMaxAgeMs,
          now,
          outageGraceMs: input.outageGraceMs,
          payload: input.payload,
          provider: input.provider,
          renewalLeadMs,
          store,
          transactions,
        }),
      ),
    )
    for (const result of results) {
      if (result === 'renewed') summary.renewed += 1
      else if (result === 'evidence-removed') summary.evidenceRemoved += 1
      else if (result === 'grace') summary.graceActivated += 1
      else if (result === 'skipped') summary.skipped += 1
      else summary.errors += 1
    }
  }
  return summary
}
