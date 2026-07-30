import { APIError, type Payload, type PayloadRequest } from 'payload'

import type { URLSafetyProvider } from '@/lib/application/url-safety-provider'
import { evaluateFallbackOriginOwnershipFreshness } from '@/lib/domain/fallback-origin'
import {
  beginFallbackURLSafetyAssessment,
  canonicalizeFallbackURL,
  completeFallbackURLSafetyAssessment,
  evaluateFallbackURLSafetyReadiness,
  fallbackURLAssessmentHash,
  fallbackURLThreats,
  pendingFallbackURLSafetyAssessment,
  type FallbackURLSafetyReadiness,
  type FallbackURLSafetyAssessment,
  type FallbackURLSafetyStatus,
  type FallbackURLThreat,
} from '@/lib/domain/fallback-url-safety'
import type { FallbackURLSafetyProviderConfiguration } from './fallback-url-safety-webhook'
import { relationID } from './tenant-context'

export type FallbackURLSafetyServiceResult =
  | {
      ok: true
      assessment: FallbackURLSafetyAssessment
    }
  | {
      code: 'INVALID_URL'
      message: string
      ok: false
    }

export async function assessFallbackURL(input: {
  maxAgeMs: number
  now?: Date
  provider: URLSafetyProvider
  url: unknown
  workspaceId: string
}): Promise<FallbackURLSafetyServiceResult> {
  const canonical = canonicalizeFallbackURL(input.url)
  if (!canonical.ok) {
    return {
      code: 'INVALID_URL',
      message: canonical.message,
      ok: false,
    }
  }

  const checking = beginFallbackURLSafetyAssessment(
    pendingFallbackURLSafetyAssessment({
      ...canonical.value,
      workspaceId: input.workspaceId,
    }),
  )
  const providerResult = await input.provider.assessURL(canonical.value.canonicalUrl)
  return {
    ok: true,
    assessment: completeFallbackURLSafetyAssessment({
      assessment: checking,
      completion:
        providerResult.kind === 'error'
          ? { kind: 'error', message: providerResult.message }
          : providerResult,
      maxAgeMs: input.maxAgeMs,
      ...(input.now ? { now: input.now } : {}),
    }),
  }
}

export type PersistedFallbackURLSafetyAssessment = FallbackURLSafetyAssessment & {
  id: number | string
  originId: string
  urlHash: string
}

type FallbackURLSafetyUnreadyReason = Extract<FallbackURLSafetyReadiness, { ok: false }>['reason']

export type ReadyFallbackURLResult =
  | { ok: true; canonicalUrl: string; assessmentId: number | string }
  | {
      ok: false
      reason:
        FallbackURLSafetyUnreadyReason | 'invalid-url' | 'missing-assessment' | 'missing-origin'
    }

type InternalAssessmentStore = {
  create(input: {
    collection: 'fallback-url-safety-assessments'
    data: Record<string, unknown>
    depth: 0
    overrideAccess: true
    req?: PayloadRequest
  }): Promise<unknown>
  find(input: {
    collection: 'fallback-url-safety-assessments'
    depth: 0
    limit: number
    overrideAccess: true
    pagination: false
    req?: PayloadRequest
    where: Record<string, unknown>
  }): Promise<{ docs: unknown[] }>
  update(input: {
    collection: 'fallback-url-safety-assessments'
    data: Record<string, unknown>
    depth: 0
    id: number | string
    overrideAccess: true
    req?: PayloadRequest
  }): Promise<unknown>
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isStatus = (value: unknown): value is FallbackURLSafetyStatus =>
  value === 'checking' ||
  value === 'error' ||
  value === 'pending' ||
  value === 'safe' ||
  value === 'unsafe'

const relationshipInput = (id: string): number | string => (/^\d+$/.test(id) ? Number(id) : id)

const optionalInstant = (value: unknown): null | string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : null

function documentThreats(value: unknown): FallbackURLThreat[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value.filter(
            (item): item is FallbackURLThreat =>
              typeof item === 'string' && fallbackURLThreats.includes(item as FallbackURLThreat),
          ),
        ),
      ]
    : []
}

export function parsePersistedFallbackURLSafetyAssessment(
  value: unknown,
): PersistedFallbackURLSafetyAssessment {
  if (!isRecord(value)) throw new Error('Fallback URL safety persistence returned invalid data.')
  const id = value.id
  const workspaceId = relationID(value.workspace)
  const originId = relationID(value.origin)
  const canonical = canonicalizeFallbackURL(value.canonicalUrl)
  if (
    (typeof id !== 'number' && typeof id !== 'string') ||
    !workspaceId ||
    !originId ||
    !canonical.ok ||
    canonical.value.hostname !== value.hostname ||
    typeof value.urlHash !== 'string' ||
    value.urlHash !== fallbackURLAssessmentHash(workspaceId, canonical.value.canonicalUrl) ||
    !isStatus(value.status)
  ) {
    throw new Error('Fallback URL safety persistence returned incomplete data.')
  }

  const redirectCount =
    typeof value.redirectCount === 'number' &&
    Number.isInteger(value.redirectCount) &&
    value.redirectCount >= 0 &&
    value.redirectCount <= 10
      ? value.redirectCount
      : 0
  return {
    ...canonical.value,
    checkedAt: optionalInstant(value.checkedAt),
    expiresAt: optionalInstant(value.expiresAt),
    id,
    lastError:
      typeof value.lastError === 'string' && value.lastError.length <= 500 ? value.lastError : null,
    originId,
    providerObservedAt: optionalInstant(value.providerObservedAt),
    redirectCount,
    status: value.status,
    threats: documentThreats(value.threats),
    urlHash: value.urlHash,
    workspaceId,
  }
}

const assessmentStore = (payload: Payload): InternalAssessmentStore =>
  payload as unknown as InternalAssessmentStore

async function loadCheckedOrigin(input: {
  originId: string
  payload: Payload
  req?: PayloadRequest
  workspaceId: string
}): Promise<{
  hostname: string
  outageGraceExpiresAt: null | string
  status: string
  verificationExpiresAt: null | string
  verifiedAt: null | string
}> {
  const origin = await input.payload.findByID({
    collection: 'fallback-origins',
    id: relationshipInput(input.originId),
    depth: 0,
    overrideAccess: true,
    ...(input.req ? { req: input.req } : {}),
  })
  if (relationID(origin.workspace) !== input.workspaceId || typeof origin.hostname !== 'string') {
    throw new APIError('Fallback origin does not belong to the selected workspace.', 403)
  }
  return {
    hostname: origin.hostname,
    outageGraceExpiresAt:
      typeof origin.outageGraceExpiresAt === 'string' ? origin.outageGraceExpiresAt : null,
    status: origin.status,
    verificationExpiresAt:
      typeof origin.verificationExpiresAt === 'string' ? origin.verificationExpiresAt : null,
    verifiedAt: typeof origin.verifiedAt === 'string' ? origin.verifiedAt : null,
  }
}

async function findPersistedAssessment(input: {
  canonicalUrl: string
  payload: Payload
  req?: PayloadRequest
  workspaceId: string
}): Promise<PersistedFallbackURLSafetyAssessment | null> {
  const urlHash = fallbackURLAssessmentHash(input.workspaceId, input.canonicalUrl)
  const result = await assessmentStore(input.payload).find({
    collection: 'fallback-url-safety-assessments',
    depth: 0,
    limit: 2,
    overrideAccess: true,
    pagination: false,
    ...(input.req ? { req: input.req } : {}),
    where: {
      and: [
        { workspace: { equals: relationshipInput(input.workspaceId) } },
        { urlHash: { equals: urlHash } },
      ],
    },
  })
  if (result.docs.length > 1) {
    throw new Error('Fallback URL safety persistence returned duplicate assessments.')
  }
  return result.docs[0] ? parsePersistedFallbackURLSafetyAssessment(result.docs[0]) : null
}

export async function ensureFallbackURLSafetyAssessment(input: {
  originId: number | string
  payload: Payload
  req?: PayloadRequest
  url: unknown
  workspaceId: number | string
}): Promise<PersistedFallbackURLSafetyAssessment> {
  const workspaceId = relationID(input.workspaceId)
  const originId = relationID(input.originId)
  if (!workspaceId || !originId) {
    throw new APIError('Select one valid workspace and fallback origin.', 400)
  }
  const canonical = canonicalizeFallbackURL(input.url)
  if (!canonical.ok) throw new APIError(canonical.message, 400)
  const origin = await loadCheckedOrigin({
    originId,
    payload: input.payload,
    ...(input.req ? { req: input.req } : {}),
    workspaceId,
  })
  if (origin.hostname !== canonical.value.hostname) {
    throw new APIError('Fallback URL hostname does not match the selected origin.', 400)
  }

  const existing = await findPersistedAssessment({
    canonicalUrl: canonical.value.canonicalUrl,
    payload: input.payload,
    ...(input.req ? { req: input.req } : {}),
    workspaceId,
  })
  if (existing) {
    if (existing.originId !== originId) {
      throw new APIError('Fallback URL assessment is bound to another origin.', 409)
    }
    return existing
  }

  const data = {
    canonicalUrl: canonical.value.canonicalUrl,
    checkedAt: null,
    expiresAt: null,
    hostname: canonical.value.hostname,
    lastError: null,
    origin: relationshipInput(originId),
    providerObservedAt: null,
    redirectCount: 0,
    status: 'pending',
    threats: [],
    urlHash: fallbackURLAssessmentHash(workspaceId, canonical.value.canonicalUrl),
    workspace: relationshipInput(workspaceId),
  }
  try {
    return parsePersistedFallbackURLSafetyAssessment(
      await assessmentStore(input.payload).create({
        collection: 'fallback-url-safety-assessments',
        data,
        depth: 0,
        overrideAccess: true,
        ...(input.req ? { req: input.req } : {}),
      }),
    )
  } catch (error) {
    // Concurrent callers can race into the composite unique index. Return the
    // winning exact-URL record only; never broaden the lookup.
    const raced = await findPersistedAssessment({
      canonicalUrl: canonical.value.canonicalUrl,
      payload: input.payload,
      ...(input.req ? { req: input.req } : {}),
      workspaceId,
    })
    if (raced?.originId === originId) return raced
    throw error
  }
}

async function persistAssessment(input: {
  assessment: PersistedFallbackURLSafetyAssessment
  payload: Payload
  req?: PayloadRequest
}): Promise<PersistedFallbackURLSafetyAssessment> {
  const value = input.assessment
  return parsePersistedFallbackURLSafetyAssessment(
    await assessmentStore(input.payload).update({
      collection: 'fallback-url-safety-assessments',
      data: {
        checkedAt: value.checkedAt,
        expiresAt: value.expiresAt,
        lastError: value.lastError,
        providerObservedAt: value.providerObservedAt,
        redirectCount: value.redirectCount,
        status: value.status,
        threats: [...value.threats],
      },
      depth: 0,
      id: value.id,
      overrideAccess: true,
      ...(input.req ? { req: input.req } : {}),
    }),
  )
}

export async function runFallbackURLSafetyAssessment(input: {
  now?: Date
  originId: number | string
  payload: Payload
  providerConfiguration?: FallbackURLSafetyProviderConfiguration
  req?: PayloadRequest
  url: unknown
  workspaceId: number | string
}): Promise<PersistedFallbackURLSafetyAssessment> {
  const current = await ensureFallbackURLSafetyAssessment(input)
  const checking = await persistAssessment({
    assessment: {
      ...beginFallbackURLSafetyAssessment(current),
      id: current.id,
      originId: current.originId,
      urlHash: current.urlHash,
    },
    payload: input.payload,
    ...(input.req ? { req: input.req } : {}),
  })
  const configuration =
    input.providerConfiguration ??
    (await import('./fallback-url-safety-webhook')).getFallbackURLSafetyProviderConfiguration()
  const completion = configuration.available
    ? await configuration.provider.assessURL(checking.canonicalUrl)
    : {
        kind: 'error' as const,
        message: configuration.message,
        retryable: true,
      }
  const completed = completeFallbackURLSafetyAssessment({
    assessment: checking,
    completion:
      completion.kind === 'error' ? { kind: 'error', message: completion.message } : completion,
    maxAgeMs: configuration.available ? configuration.maxAgeMs : 60 * 60 * 1_000,
    ...(input.now ? { now: input.now } : {}),
  })
  return persistAssessment({
    assessment: {
      ...completed,
      id: checking.id,
      originId: checking.originId,
      urlHash: checking.urlHash,
    },
    payload: input.payload,
    ...(input.req ? { req: input.req } : {}),
  })
}

export async function findReadyFallbackURL(input: {
  now?: Date
  payload: Payload
  req?: PayloadRequest
  url: unknown
  workspaceId: number | string
}): Promise<ReadyFallbackURLResult> {
  const workspaceId = relationID(input.workspaceId)
  const canonical = canonicalizeFallbackURL(input.url)
  if (!workspaceId || !canonical.ok) return { ok: false, reason: 'invalid-url' }

  const assessment = await findPersistedAssessment({
    canonicalUrl: canonical.value.canonicalUrl,
    payload: input.payload,
    ...(input.req ? { req: input.req } : {}),
    workspaceId,
  })
  if (!assessment) {
    const origins = await input.payload.find({
      collection: 'fallback-origins',
      depth: 0,
      limit: 2,
      overrideAccess: true,
      pagination: false,
      ...(input.req ? { req: input.req } : {}),
      where: {
        and: [
          { workspace: { equals: relationshipInput(workspaceId) } },
          { hostname: { equals: canonical.value.hostname } },
        ],
      },
    })
    return origins.docs.length === 1 && origins.docs[0]?.status === 'revoked'
      ? { ok: false, reason: 'ownership-revoked' }
      : { ok: false, reason: 'missing-assessment' }
  }

  let origin: Awaited<ReturnType<typeof loadCheckedOrigin>>
  try {
    origin = await loadCheckedOrigin({
      originId: assessment.originId,
      payload: input.payload,
      ...(input.req ? { req: input.req } : {}),
      workspaceId,
    })
  } catch {
    return { ok: false, reason: 'missing-origin' }
  }
  if (origin.hostname !== canonical.value.hostname) {
    return { ok: false, reason: 'missing-origin' }
  }
  if (
    origin.status !== 'revoked' &&
    !evaluateFallbackOriginOwnershipFreshness(
      {
        outageGraceExpiresAt: origin.outageGraceExpiresAt,
        status:
          origin.status === 'pending' ||
          origin.status === 'revoked' ||
          origin.status === 'verified' ||
          origin.status === 'verifying'
            ? origin.status
            : 'pending',
        verificationExpiresAt: origin.verificationExpiresAt,
        verifiedAt: origin.verifiedAt,
      },
      input.now,
    ).ok
  ) {
    return { ok: false, reason: 'ownership-unverified' }
  }
  const readiness = evaluateFallbackURLSafetyReadiness({
    assessment,
    ...(input.now ? { now: input.now } : {}),
    originStatus: origin.status,
    workspaceId,
  })
  return readiness.ok
    ? {
        assessmentId: assessment.id,
        canonicalUrl: readiness.canonicalUrl,
        ok: true,
      }
    : readiness
}
