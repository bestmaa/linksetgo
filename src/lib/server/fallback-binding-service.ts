import { APIError, type Payload, type PayloadRequest } from 'payload'

import {
  canonicalizeFallbackURL,
  fallbackURLAssessmentHash,
} from '@/lib/domain/fallback-url-safety'
import {
  ensureFallbackURLSafetyAssessment,
  parsePersistedFallbackURLSafetyAssessment,
  type PersistedFallbackURLSafetyAssessment,
} from './fallback-url-safety-service'
import { enforceFallbackAssessmentCapacity } from './fallback-binding-quota'
import {
  countLiveFallbackURLReferences,
  hasLiveFallbackURLReference,
} from './fallback-binding-references'
import { acquireTransactionLock, requiredTransaction } from './postgres-lock'
import { relationID } from './tenant-context'

type RegisteredOrigin = {
  id: number | string
  status: 'pending' | 'revoked' | 'verified' | 'verifying'
  workspaceID: string
}

export type AppliedFallbackBinding = {
  assessmentID: number | string
  assessmentStatus: PersistedFallbackURLSafetyAssessment['status']
  canonicalUrl: string
  originID: number | string
  originStatus: Exclude<RegisteredOrigin['status'], 'revoked'>
}

const relationshipInput = (id: string): number | string => (/^\d+$/.test(id) ? Number(id) : id)
const workspaceRelationshipInput = (id: string): number => {
  const value = Number(id)
  if (!Number.isSafeInteger(value) || value <= 0 || String(value) !== id) {
    throw new APIError('Select one valid workspace.', 400)
  }
  return value
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function parseOrigin(value: unknown): RegisteredOrigin {
  if (!isRecord(value)) throw new Error('Fallback-origin persistence returned invalid data.')
  const id = value.id
  const workspaceID = relationID(value.workspace)
  const status = value.status
  if (
    (typeof id !== 'number' && typeof id !== 'string') ||
    !workspaceID ||
    (status !== 'pending' &&
      status !== 'revoked' &&
      status !== 'verified' &&
      status !== 'verifying')
  ) {
    throw new Error('Fallback-origin persistence returned incomplete data.')
  }
  return { id, status, workspaceID }
}

async function findWorkspaceOrigin(input: {
  hostname: string
  payload: Payload
  req: PayloadRequest
  workspaceID: string
}): Promise<RegisteredOrigin | null> {
  const result = await input.payload.find({
    collection: 'fallback-origins',
    depth: 0,
    limit: 2,
    overrideAccess: true,
    pagination: false,
    req: input.req,
    where: {
      and: [
        { workspace: { equals: relationshipInput(input.workspaceID) } },
        { hostname: { equals: input.hostname } },
      ],
    },
  })
  if (result.docs.length > 1) {
    throw new Error('Fallback-origin persistence returned duplicate hostnames.')
  }
  return result.docs[0] ? parseOrigin(result.docs[0]) : null
}

async function findAssessment(input: {
  canonicalUrl: string
  payload: Payload
  req: PayloadRequest
  workspaceID: string
}): Promise<PersistedFallbackURLSafetyAssessment | null> {
  const result = await input.payload.find({
    collection: 'fallback-url-safety-assessments',
    depth: 0,
    limit: 2,
    overrideAccess: true,
    pagination: false,
    req: input.req,
    where: {
      and: [
        { workspace: { equals: relationshipInput(input.workspaceID) } },
        {
          urlHash: {
            equals: fallbackURLAssessmentHash(input.workspaceID, input.canonicalUrl),
          },
        },
      ],
    },
  })
  if (result.docs.length > 1) {
    throw new Error('Fallback URL safety persistence returned duplicate assessments.')
  }
  return result.docs[0] ? parsePersistedFallbackURLSafetyAssessment(result.docs[0]) : null
}

const referenceLockKey = (workspaceID: string, canonicalUrl: string): string =>
  fallbackURLAssessmentHash(workspaceID, canonicalUrl)

type ReplacedFallbackBinding = {
  url: unknown
  workspaceID: number | string
}

/**
 * Applies the ownership and exact-URL safety binding inside the caller's
 * resource transaction. The shared advisory lock serializes binding, resource
 * mutation, sweep claims, and orphan cleanup for this workspace/URL pair.
 */
export async function applyFallbackBinding(input: {
  payload: Payload
  replaces?: ReplacedFallbackBinding
  req: PayloadRequest
  url: unknown
  workspaceID: number | string
}): Promise<AppliedFallbackBinding> {
  const workspaceID = relationID(input.workspaceID)
  const canonical = canonicalizeFallbackURL(input.url)
  if (!workspaceID) throw new APIError('Select one valid workspace.', 400)
  if (!canonical.ok) throw new APIError(canonical.message, 400)

  await requiredTransaction(input.req)
  const replacedWorkspaceID = input.replaces ? relationID(input.replaces.workspaceID) : null
  const replacedCanonical = input.replaces
    ? canonicalizeFallbackURL(input.replaces.url)
    : { ok: false as const }
  const referenceLocks = [
    referenceLockKey(workspaceID, canonical.value.canonicalUrl),
    ...(replacedWorkspaceID && replacedCanonical.ok
      ? [referenceLockKey(replacedWorkspaceID, replacedCanonical.value.canonicalUrl)]
      : []),
  ]
  for (const key of [...new Set(referenceLocks)].sort()) {
    await acquireTransactionLock(input.req, 'fallback-binding-reference', key)
  }

  let origin = await findWorkspaceOrigin({
    hostname: canonical.value.hostname,
    payload: input.payload,
    req: input.req,
    workspaceID,
  })
  if (origin?.status === 'revoked') {
    throw new APIError('This fallback hostname has been revoked and cannot be reused.', 409)
  }
  if (!origin) {
    origin = parseOrigin(
      await input.payload.create({
        collection: 'fallback-origins',
        data: {
          hostname: canonical.value.hostname,
          status: 'pending',
          verificationToken: 'generated-by-server',
          workspace: workspaceRelationshipInput(workspaceID),
        },
        depth: 0,
        overrideAccess: true,
        req: input.req,
      }),
    )
  }
  if (origin.workspaceID !== workspaceID || origin.status === 'revoked') {
    throw new APIError('Fallback-origin persistence returned a workspace mismatch.', 500)
  }

  const newReferenceCount = await countLiveFallbackURLReferences({
    canonicalUrl: canonical.value.canonicalUrl,
    payload: input.payload,
    req: input.req,
    workspaceID,
  })
  const releasesLiveAssessment =
    replacedWorkspaceID === workspaceID &&
    replacedCanonical.ok &&
    replacedCanonical.value.canonicalUrl !== canonical.value.canonicalUrl &&
    (await countLiveFallbackURLReferences({
      canonicalUrl: replacedCanonical.value.canonicalUrl,
      payload: input.payload,
      req: input.req,
      workspaceID,
    })) === 1

  let assessment = await findAssessment({
    canonicalUrl: canonical.value.canonicalUrl,
    payload: input.payload,
    req: input.req,
    workspaceID,
  })
  if (!assessment || newReferenceCount === 0) {
    await enforceFallbackAssessmentCapacity({
      addsLiveAssessment: newReferenceCount === 0,
      createsRecord: !assessment,
      releasesLiveAssessment,
      req: input.req,
      workspaceID,
    })
  }
  if (!assessment) {
    assessment = await ensureFallbackURLSafetyAssessment({
      originId: origin.id,
      payload: input.payload,
      req: input.req,
      url: canonical.value.canonicalUrl,
      workspaceId: workspaceID,
    })
  }
  if (assessment.originId !== String(origin.id)) {
    throw new APIError('Fallback URL assessment is bound to another origin.', 409)
  }
  if (assessment.status === 'unsafe') {
    throw new APIError(
      'This exact fallback URL failed its safety check and cannot be selected.',
      422,
    )
  }

  return {
    assessmentID: assessment.id,
    assessmentStatus: assessment.status,
    canonicalUrl: assessment.canonicalUrl,
    originID: origin.id,
    originStatus: origin.status,
  }
}

export async function garbageCollectFallbackBinding(input: {
  payload: Payload
  req: PayloadRequest
  url: unknown
  workspaceID: number | string
}): Promise<'deleted' | 'kept' | 'missing' | 'retained'> {
  const workspaceID = relationID(input.workspaceID)
  const canonical = canonicalizeFallbackURL(input.url)
  if (!workspaceID || !canonical.ok) return 'missing'

  await requiredTransaction(input.req)
  await acquireTransactionLock(
    input.req,
    'fallback-binding-reference',
    referenceLockKey(workspaceID, canonical.value.canonicalUrl),
  )
  if (
    await hasLiveFallbackURLReference({
      canonicalUrl: canonical.value.canonicalUrl,
      payload: input.payload,
      req: input.req,
      workspaceID,
    })
  ) {
    return 'kept'
  }

  const assessment = await findAssessment({
    canonicalUrl: canonical.value.canonicalUrl,
    payload: input.payload,
    req: input.req,
    workspaceID,
  })
  if (!assessment) return 'missing'
  // Provider-checked orphan rows are a short-lived, bounded churn cache. An
  // A→B→A replacement reuses the exact verdict instead of purchasing another
  // scan; the normal safety sweep removes the row after its retry/TTL window.
  if (assessment.checkedAt !== null) return 'retained'
  await input.payload.delete({
    collection: 'fallback-url-safety-assessments',
    id: assessment.id,
    depth: 0,
    overrideAccess: true,
    req: input.req,
  })
  return 'deleted'
}
