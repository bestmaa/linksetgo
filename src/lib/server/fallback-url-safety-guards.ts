import { APIError, type CollectionBeforeValidateHook } from 'payload'

import {
  canonicalizeFallbackURL,
  fallbackURLAssessmentHash,
  type FallbackURLSafetyStatus,
} from '@/lib/domain/fallback-url-safety'
import { relationID } from './tenant-context'

const transitions: Readonly<Record<FallbackURLSafetyStatus, readonly FallbackURLSafetyStatus[]>> = {
  checking: ['error', 'safe', 'unsafe'],
  error: ['checking'],
  pending: ['checking'],
  safe: ['checking'],
  unsafe: ['checking'],
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const selected = (
  next: Record<string, unknown>,
  previous: Record<string, unknown>,
  field: string,
): unknown => (Object.hasOwn(next, field) ? next[field] : previous[field])

const isStatus = (value: unknown): value is FallbackURLSafetyStatus =>
  value === 'checking' ||
  value === 'error' ||
  value === 'pending' ||
  value === 'safe' ||
  value === 'unsafe'

const relationshipInput = (id: string): number | string => (/^\d+$/.test(id) ? Number(id) : id)

export const enforceFallbackURLSafetyAssessment: CollectionBeforeValidateHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  const next = isRecord(data) ? data : {}
  const previous = isRecord(originalDoc) ? originalDoc : {}
  const workspaceID = relationID(selected(next, previous, 'workspace'))
  const originID = relationID(selected(next, previous, 'origin'))
  if (!workspaceID || !originID) {
    throw new APIError('A fallback safety assessment requires a workspace and origin.', 400)
  }

  const canonical = canonicalizeFallbackURL(selected(next, previous, 'canonicalUrl'))
  if (!canonical.ok) throw new APIError(canonical.message, 400)

  if (
    operation === 'update' &&
    (workspaceID !== relationID(previous.workspace) ||
      originID !== relationID(previous.origin) ||
      canonical.value.canonicalUrl !== previous.canonicalUrl)
  ) {
    throw new APIError(
      'Assessment workspace, origin, and canonical URL are immutable. Create a new assessment.',
      409,
    )
  }

  const origin = await req.payload.findByID({
    collection: 'fallback-origins',
    id: relationshipInput(originID),
    depth: 0,
    overrideAccess: true,
    req,
  })
  if (
    relationID(origin.workspace) !== workspaceID ||
    origin.hostname !== canonical.value.hostname
  ) {
    throw new APIError('The fallback URL hostname must match an origin in the same workspace.', 400)
  }

  const statusValue = selected(next, previous, 'status')
  const status: FallbackURLSafetyStatus = isStatus(statusValue) ? statusValue : 'pending'
  const previousStatus = isStatus(previous.status) ? previous.status : null
  if (operation === 'create' && status !== 'pending') {
    throw new APIError('A new fallback URL assessment must begin in pending.', 400)
  }
  if (
    operation === 'update' &&
    previousStatus &&
    status !== previousStatus &&
    !transitions[previousStatus].includes(status)
  ) {
    throw new APIError(`Fallback URL safety cannot move from ${previousStatus} to ${status}.`, 409)
  }

  return {
    ...next,
    canonicalUrl: canonical.value.canonicalUrl,
    hostname: canonical.value.hostname,
    status,
    urlHash: fallbackURLAssessmentHash(workspaceID, canonical.value.canonicalUrl),
    workspace: relationshipInput(workspaceID),
    origin: relationshipInput(originID),
  }
}
