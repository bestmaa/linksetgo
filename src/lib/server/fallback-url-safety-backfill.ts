import 'server-only'

import {
  commitTransaction,
  createLocalReq,
  initTransaction,
  killTransaction,
  type Payload,
  type PayloadRequest,
} from 'payload'

import {
  canonicalizeFallbackURL,
  fallbackURLAssessmentHash,
} from '@/lib/domain/fallback-url-safety'
import type { User } from '@/payload-types'
import {
  ensureFallbackURLSafetyAssessment,
  parsePersistedFallbackURLSafetyAssessment,
} from './fallback-url-safety-service'
import { acquireTransactionLock } from './postgres-lock'
import { relationID } from './tenant-context'

type SourceCollection = 'apps' | 'deep-links'

type PageResult = {
  docs: unknown[]
  hasNextPage?: boolean
  nextPage?: null | number
}

type BackfillStore = {
  create(input: {
    collection: 'fallback-origins'
    data: Record<string, unknown>
    depth: 0
    overrideAccess: true
    req: PayloadRequest
    user: User
  }): Promise<unknown>
  find(input: {
    collection: 'apps' | 'deep-links' | 'fallback-origins' | 'fallback-url-safety-assessments'
    depth: number
    limit: number
    overrideAccess: true
    page?: number
    pagination: boolean
    req?: PayloadRequest
    sort?: string
    where: Record<string, unknown>
  }): Promise<PageResult>
  findByID(input: {
    collection: 'apps'
    depth: 0
    id: number | string
    overrideAccess: true
  }): Promise<unknown>
}

type RegisteredOrigin = {
  id: number | string
  status: 'pending' | 'revoked' | 'verified' | 'verifying'
  workspaceID: string
}

type BackfillCandidate = {
  canonicalUrl: string
  hostname: string
  workspaceID: string
}

type ApplyOutcome =
  | { kind: 'revoked-origin' }
  | {
      assessmentQueued: boolean
      kind: 'ready'
      originCreated: boolean
      originKey: string
    }

export type FallbackURLSafetyBackfillTransactions = {
  acquireLock(req: PayloadRequest, originKey: string): Promise<void>
  commit(req: PayloadRequest): Promise<void>
  createRequest(payload: Payload, actor: User): Promise<PayloadRequest>
  init(req: PayloadRequest): Promise<boolean>
  rollback(req: PayloadRequest): Promise<void>
}

export type FallbackURLSafetyBackfillSummary = {
  appFallbacksFound: number
  appPagesScanned: number
  appsScanned: number
  apply: boolean
  assessmentsExisting: number
  assessmentsQueued: number
  assessmentsToQueue: number
  deepLinkFallbacksFound: number
  deepLinkPagesScanned: number
  deepLinksScanned: number
  duplicateCandidates: number
  failures: number
  invalidURLs: number
  originsCreated: number
  originsExisting: number
  originsToCreate: number
  pageSize: number
  revokedOrigins: number
  uniqueCandidates: number
  unscopedCandidates: number
}

type BackfillInput = {
  actor?: User
  apply?: boolean
  pageSize?: number
  payload: Payload
  transactions?: FallbackURLSafetyBackfillTransactions
}

const defaultPageSize = 50
const maximumPageSize = 100

const defaultTransactions: FallbackURLSafetyBackfillTransactions = {
  acquireLock: (req, originKey) =>
    acquireTransactionLock(req, 'fallback-url-safety-backfill-origin', originKey),
  commit: commitTransaction,
  createRequest: (payload, actor) => createLocalReq({ user: actor }, payload),
  init: initTransaction,
  rollback: killTransaction,
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const relationshipInput = (id: string): number | string => (/^\d+$/.test(id) ? Number(id) : id)

const normalizedPageSize = (value: number | undefined): number => {
  if (!Number.isFinite(value)) return defaultPageSize
  return Math.min(maximumPageSize, Math.max(1, Math.floor(value ?? defaultPageSize)))
}

function parseOrigin(value: unknown): RegisteredOrigin {
  if (!isRecord(value)) throw new Error('Fallback-origin backfill received invalid data.')
  const workspaceID = relationID(value.workspace)
  if (
    (typeof value.id !== 'number' && typeof value.id !== 'string') ||
    !workspaceID ||
    (value.status !== 'pending' &&
      value.status !== 'revoked' &&
      value.status !== 'verified' &&
      value.status !== 'verifying')
  ) {
    throw new Error('Fallback-origin backfill received incomplete data.')
  }
  return {
    id: value.id,
    status: value.status,
    workspaceID,
  }
}

async function findOrigin(input: {
  hostname: string
  req?: PayloadRequest
  store: BackfillStore
  workspaceID: string
}): Promise<RegisteredOrigin | null> {
  const result = await input.store.find({
    collection: 'fallback-origins',
    depth: 0,
    limit: 2,
    overrideAccess: true,
    pagination: false,
    ...(input.req ? { req: input.req } : {}),
    where: {
      and: [
        { workspace: { equals: relationshipInput(input.workspaceID) } },
        { hostname: { equals: input.hostname } },
      ],
    },
  })
  if (result.docs.length > 1) {
    throw new Error('Fallback-origin backfill found duplicate workspace hostnames.')
  }
  return result.docs[0] ? parseOrigin(result.docs[0]) : null
}

async function findAssessment(input: {
  candidate: BackfillCandidate
  req?: PayloadRequest
  store: BackfillStore
}) {
  const result = await input.store.find({
    collection: 'fallback-url-safety-assessments',
    depth: 0,
    limit: 2,
    overrideAccess: true,
    pagination: false,
    ...(input.req ? { req: input.req } : {}),
    where: {
      and: [
        { workspace: { equals: relationshipInput(input.candidate.workspaceID) } },
        {
          urlHash: {
            equals: fallbackURLAssessmentHash(
              input.candidate.workspaceID,
              input.candidate.canonicalUrl,
            ),
          },
        },
      ],
    },
  })
  if (result.docs.length > 1) {
    throw new Error('Fallback URL safety backfill found duplicate assessments.')
  }
  return result.docs[0] ? parsePersistedFallbackURLSafetyAssessment(result.docs[0]) : null
}

async function createPendingOrigin(input: {
  actor: User
  candidate: BackfillCandidate
  payload: Payload
  req: PayloadRequest
  store: BackfillStore
}): Promise<RegisteredOrigin> {
  return parseOrigin(
    await input.store.create({
      collection: 'fallback-origins',
      data: {
        hostname: input.candidate.hostname,
        status: 'pending',
        verificationToken: 'generated-by-server',
        workspace: relationshipInput(input.candidate.workspaceID),
      },
      depth: 0,
      overrideAccess: true,
      req: input.req,
      user: input.actor,
    }),
  )
}

async function applyCandidateOnce(input: {
  actor: User
  candidate: BackfillCandidate
  payload: Payload
  store: BackfillStore
  transactions: FallbackURLSafetyBackfillTransactions
}): Promise<ApplyOutcome> {
  const req = await input.transactions.createRequest(input.payload, input.actor)
  if (!(await input.transactions.init(req))) {
    throw new Error('Fallback URL safety backfill could not start a transaction.')
  }

  try {
    const originKey = `${input.candidate.workspaceID}\0${input.candidate.hostname}`
    await input.transactions.acquireLock(req, originKey)
    let origin = await findOrigin({
      hostname: input.candidate.hostname,
      req,
      store: input.store,
      workspaceID: input.candidate.workspaceID,
    })
    if (origin?.status === 'revoked') {
      await input.transactions.commit(req)
      return { kind: 'revoked-origin' }
    }

    const originCreated = origin === null
    origin ??= await createPendingOrigin({
      actor: input.actor,
      candidate: input.candidate,
      payload: input.payload,
      req,
      store: input.store,
    })
    if (origin.workspaceID !== input.candidate.workspaceID || origin.status === 'revoked') {
      throw new Error('Fallback-origin backfill created an invalid ownership record.')
    }

    const existingAssessment = await findAssessment({
      candidate: input.candidate,
      req,
      store: input.store,
    })
    if (existingAssessment && existingAssessment.originId !== String(origin.id)) {
      throw new Error('Fallback URL safety assessment is bound to another origin.')
    }
    if (!existingAssessment) {
      await ensureFallbackURLSafetyAssessment({
        originId: origin.id,
        payload: input.payload,
        req,
        url: input.candidate.canonicalUrl,
        workspaceId: input.candidate.workspaceID,
      })
    }

    await input.transactions.commit(req)
    return {
      assessmentQueued: existingAssessment === null,
      kind: 'ready',
      originCreated,
      originKey,
    }
  } catch (error) {
    await input.transactions.rollback(req).catch(() => undefined)
    throw error
  }
}

async function applyCandidate(input: {
  actor: User
  candidate: BackfillCandidate
  payload: Payload
  store: BackfillStore
  transactions: FallbackURLSafetyBackfillTransactions
}): Promise<ApplyOutcome> {
  try {
    return await applyCandidateOnce(input)
  } catch {
    // A non-cooperating writer can win the workspace-hostname composite unique
    // constraint race. A fresh transaction reloads that workspace's winner.
    return applyCandidateOnce(input)
  }
}

function emptySummary(apply: boolean, pageSize: number): FallbackURLSafetyBackfillSummary {
  return {
    appFallbacksFound: 0,
    appPagesScanned: 0,
    appsScanned: 0,
    apply,
    assessmentsExisting: 0,
    assessmentsQueued: 0,
    assessmentsToQueue: 0,
    deepLinkFallbacksFound: 0,
    deepLinkPagesScanned: 0,
    deepLinksScanned: 0,
    duplicateCandidates: 0,
    failures: 0,
    invalidURLs: 0,
    originsCreated: 0,
    originsExisting: 0,
    originsToCreate: 0,
    pageSize,
    revokedOrigins: 0,
    uniqueCandidates: 0,
    unscopedCandidates: 0,
  }
}

async function scanPages(input: {
  collection: SourceCollection
  onDocument(document: unknown): Promise<void>
  pageSize: number
  store: BackfillStore
  summary: FallbackURLSafetyBackfillSummary
}): Promise<void> {
  let page = 1
  while (true) {
    const result = await input.store.find({
      collection: input.collection,
      depth: input.collection === 'deep-links' ? 1 : 0,
      limit: input.pageSize,
      overrideAccess: true,
      page,
      pagination: true,
      sort: 'id',
      where: { fallbackUrl: { exists: true } },
    })
    const documents = result.docs.slice(0, input.pageSize)
    if (input.collection === 'apps') {
      input.summary.appPagesScanned += 1
      input.summary.appsScanned += documents.length
    } else {
      input.summary.deepLinkPagesScanned += 1
      input.summary.deepLinksScanned += documents.length
    }
    for (const document of documents) await input.onDocument(document)
    if (result.hasNextPage !== true) return
    page =
      typeof result.nextPage === 'number' && result.nextPage > page ? result.nextPage : page + 1
  }
}

async function workspaceForDeepLink(
  value: unknown,
  store: BackfillStore,
  cache: Map<string, null | string>,
): Promise<null | string> {
  if (!isRecord(value)) return null
  if (isRecord(value.app)) {
    const populatedWorkspaceID = relationID(value.app.workspace)
    if (populatedWorkspaceID) return populatedWorkspaceID
  }
  const appID = relationID(value.app)
  if (!appID) return null
  if (cache.has(appID)) return cache.get(appID) ?? null
  const app = await store.findByID({
    collection: 'apps',
    depth: 0,
    id: relationshipInput(appID),
    overrideAccess: true,
  })
  const workspaceID = isRecord(app) ? relationID(app.workspace) : null
  cache.set(appID, workspaceID)
  return workspaceID
}

export async function backfillFallbackURLSafetyRegistrations(
  input: BackfillInput,
): Promise<FallbackURLSafetyBackfillSummary> {
  const apply = input.apply === true
  if (apply && !input.actor) {
    throw new Error('Apply mode requires one active platform super-admin.')
  }
  const pageSize = normalizedPageSize(input.pageSize)
  const summary = emptySummary(apply, pageSize)
  const store = input.payload as unknown as BackfillStore
  const transactions = input.transactions ?? defaultTransactions
  const seenCandidates = new Set<string>()
  const countedOrigins = new Set<string>()
  const appWorkspaceCache = new Map<string, null | string>()

  const processCandidate = async (
    rawFallbackURL: unknown,
    workspaceID: null | string,
    source: SourceCollection,
  ): Promise<void> => {
    if (rawFallbackURL === null || rawFallbackURL === undefined || rawFallbackURL === '') return
    if (source === 'apps') summary.appFallbacksFound += 1
    else summary.deepLinkFallbacksFound += 1
    if (!workspaceID) {
      summary.unscopedCandidates += 1
      return
    }
    const canonical = canonicalizeFallbackURL(rawFallbackURL)
    if (!canonical.ok) {
      summary.invalidURLs += 1
      return
    }
    const candidate: BackfillCandidate = {
      ...canonical.value,
      workspaceID,
    }
    const candidateKey = fallbackURLAssessmentHash(workspaceID, candidate.canonicalUrl)
    if (seenCandidates.has(candidateKey)) {
      summary.duplicateCandidates += 1
      return
    }
    seenCandidates.add(candidateKey)
    summary.uniqueCandidates += 1

    if (apply) {
      try {
        const outcome = await applyCandidate({
          actor: input.actor!,
          candidate,
          payload: input.payload,
          store,
          transactions,
        })
        if (outcome.kind === 'revoked-origin') {
          summary.revokedOrigins += 1
          return
        }
        if (!countedOrigins.has(outcome.originKey)) {
          countedOrigins.add(outcome.originKey)
          if (outcome.originCreated) summary.originsCreated += 1
          else summary.originsExisting += 1
        }
        if (outcome.assessmentQueued) summary.assessmentsQueued += 1
        else summary.assessmentsExisting += 1
      } catch {
        summary.failures += 1
      }
      return
    }

    try {
      const origin = await findOrigin({
        hostname: candidate.hostname,
        store,
        workspaceID,
      })
      if (origin?.status === 'revoked') {
        summary.revokedOrigins += 1
        return
      }
      const originKey = `${workspaceID}\0${candidate.hostname}`
      if (!countedOrigins.has(originKey)) {
        countedOrigins.add(originKey)
        if (origin) summary.originsExisting += 1
        else summary.originsToCreate += 1
      }
      const assessment = await findAssessment({ candidate, store })
      if (assessment) {
        if (!origin || assessment.originId !== String(origin.id)) {
          summary.failures += 1
          return
        }
        summary.assessmentsExisting += 1
      } else {
        summary.assessmentsToQueue += 1
      }
    } catch {
      summary.failures += 1
    }
  }

  await scanPages({
    collection: 'apps',
    onDocument: async (document) => {
      if (!isRecord(document)) {
        summary.failures += 1
        return
      }
      const workspaceID = relationID(document.workspace)
      const appID = relationID(document.id)
      if (appID) appWorkspaceCache.set(appID, workspaceID)
      await processCandidate(document.fallbackUrl, workspaceID, 'apps')
    },
    pageSize,
    store,
    summary,
  })
  await scanPages({
    collection: 'deep-links',
    onDocument: async (document) => {
      try {
        const workspaceID = await workspaceForDeepLink(document, store, appWorkspaceCache)
        await processCandidate(
          isRecord(document) ? document.fallbackUrl : undefined,
          workspaceID,
          'deep-links',
        )
      } catch {
        summary.failures += 1
      }
    },
    pageSize,
    store,
    summary,
  })

  return summary
}
