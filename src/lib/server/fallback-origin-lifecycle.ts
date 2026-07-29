import { createHash, randomBytes } from 'node:crypto'

import {
  APIError,
  type CollectionBeforeValidateHook,
  type Payload,
  type PayloadRequest,
} from 'payload'

import type {
  DNSOwnershipEvidenceProvider,
  TXTEvidence,
} from '@/lib/application/dns-evidence-provider'
import {
  buildFallbackOriginInstructions,
  canTransitionFallbackOrigin,
  evaluateFallbackOriginEvidence,
  normalizeFallbackOriginHostname,
  type FallbackOriginStatus,
} from '@/lib/domain/fallback-origin'
import { normalizeHostname } from '@/lib/domain/workspace-domain'
import { canAccessWorkspace, relationID } from './tenant-context'
import { getServerEnvironment } from './env'

type FallbackOriginRecord = {
  id: number | string
  hostname: string
  lastCheckedAt?: null | string
  lastEvidence?: null | {
    observedAt: string
    recordName: string
    valueHashes: string[]
  }
  lastVerificationError?: null | string
  revokedAt?: null | string
  status: FallbackOriginStatus
  verificationToken: string
  verifiedAt?: null | string
  workspace: number | string | { id: number | string }
}

export type FallbackOriginLifecycleResult =
  | { ok: true; origin: FallbackOriginRecord }
  | {
      ok: false
      code: 'DNS_EVIDENCE_REJECTED' | 'DNS_PROVIDER_UNAVAILABLE' | 'INVALID_STATE'
      message: string
      origin: FallbackOriginRecord
    }

const lifecycleRequests = new WeakSet<PayloadRequest>()

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const selected = (
  next: Record<string, unknown>,
  previous: Record<string, unknown>,
  field: string,
): unknown => (Object.hasOwn(next, field) ? next[field] : previous[field])

const isFallbackStatus = (value: unknown): value is FallbackOriginStatus =>
  value === 'pending' || value === 'revoked' || value === 'verified' || value === 'verifying'

const relationshipInput = (id: string): number | string => (/^\d+$/.test(id) ? Number(id) : id)

const isLifecycleFieldMutation = (
  next: Record<string, unknown>,
  previous: Record<string, unknown>,
): boolean =>
  [
    'lastCheckedAt',
    'lastEvidence',
    'lastVerificationError',
    'revokedAt',
    'status',
    'verifiedAt',
  ].some((field) => Object.hasOwn(next, field) && next[field] !== previous[field])

function asFallbackOrigin(value: unknown): FallbackOriginRecord {
  if (!isRecord(value)) throw new Error('Fallback-origin persistence returned an invalid record.')
  const id = value.id
  const workspace = value.workspace
  if (
    (typeof id !== 'number' && typeof id !== 'string') ||
    typeof value.hostname !== 'string' ||
    !isFallbackStatus(value.status) ||
    typeof value.verificationToken !== 'string' ||
    (!relationID(workspace) && workspace !== 0)
  ) {
    throw new Error('Fallback-origin persistence returned an incomplete record.')
  }
  return value as FallbackOriginRecord
}

function assertHostnameIsCustomerOwned(hostname: string): void {
  const environment = getServerEnvironment()
  const legacyHostname = normalizeHostname(new URL(environment.publicLinkBaseURL).hostname)
  if (hostname === legacyHostname) {
    throw new APIError('The installation link hostname cannot be a fallback origin.', 400)
  }

  const managedRoot = environment.managedLinkRootDomain
  if (managedRoot && (hostname === managedRoot || hostname.endsWith(`.${managedRoot}`))) {
    throw new APIError('Managed LinksetGo hostnames cannot be fallback origins.', 400)
  }
}

async function assertWorkspaceManager(req: PayloadRequest, workspace: unknown): Promise<string> {
  const workspaceID = relationID(workspace)
  if (!workspaceID || !(await canAccessWorkspace(req, workspaceID, 'manage'))) {
    throw new APIError('Select a workspace you are allowed to manage.', 403)
  }
  return workspaceID
}

function boundedEvidence(
  recordName: string,
  evidence: TXTEvidence,
): {
  observedAt: string
  recordName: string
  txtValues: string[]
  valueHashes: string[]
} {
  const observedAt = new Date(evidence.observedAt)
  if (!Number.isFinite(observedAt.getTime())) {
    throw new APIError('The DNS provider returned an invalid observation time.', 502)
  }

  if (
    evidence.values.length > 50 ||
    evidence.values.some((value) => value.length > 1_024) ||
    evidence.values.reduce((total, value) => total + value.length, 0) > 16_384
  ) {
    throw new APIError('The DNS provider returned too much TXT evidence.', 502)
  }

  const txtValues = evidence.values.map((value) => value.trim())
  return {
    observedAt: observedAt.toISOString(),
    recordName,
    txtValues,
    valueHashes: txtValues.map((value) => createHash('sha256').update(value).digest('hex')),
  }
}

async function updateOrigin(
  payload: Payload,
  req: PayloadRequest,
  id: number | string,
  data: Record<string, unknown>,
): Promise<FallbackOriginRecord> {
  lifecycleRequests.add(req)
  try {
    return asFallbackOrigin(
      await payload.update({
        collection: 'fallback-origins',
        id,
        data,
        depth: 0,
        overrideAccess: true,
        req,
      }),
    )
  } finally {
    lifecycleRequests.delete(req)
  }
}

async function loadOrigin(
  payload: Payload,
  req: PayloadRequest,
  id: number | string,
): Promise<FallbackOriginRecord> {
  const origin = asFallbackOrigin(
    await payload.findByID({
      collection: 'fallback-origins',
      id,
      depth: 0,
      overrideAccess: true,
      req,
    }),
  )
  await assertWorkspaceManager(req, origin.workspace)
  return origin
}

export const enforceFallbackOriginLifecycle: CollectionBeforeValidateHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  const next = isRecord(data) ? data : {}
  const previous = isRecord(originalDoc) ? originalDoc : {}
  const hostname = normalizeFallbackOriginHostname(selected(next, previous, 'hostname'))
  if (!hostname) {
    throw new APIError('Enter one public fallback hostname without a scheme, port, or path.', 400)
  }
  assertHostnameIsCustomerOwned(hostname)

  const workspaceID = await assertWorkspaceManager(req, selected(next, previous, 'workspace'))
  if (
    operation === 'update' &&
    (hostname !== previous.hostname ||
      workspaceID !== relationID(previous.workspace) ||
      (Object.hasOwn(next, 'verificationToken') &&
        next.verificationToken !== previous.verificationToken))
  ) {
    throw new APIError(
      'A fallback origin hostname, workspace, and verification token are immutable.',
      409,
    )
  }

  const statusValue = selected(next, previous, 'status')
  const nextStatus: FallbackOriginStatus = isFallbackStatus(statusValue) ? statusValue : 'pending'
  const previousStatus = isFallbackStatus(previous.status) ? previous.status : null
  if (operation === 'create' && nextStatus !== 'pending') {
    throw new APIError('A new fallback origin must begin in pending.', 400)
  }
  if (operation === 'update' && isLifecycleFieldMutation(next, previous)) {
    if (!lifecycleRequests.has(req)) {
      throw new APIError('Use the fallback-origin verification lifecycle for this change.', 403)
    }
    if (previousStatus && !canTransitionFallbackOrigin(previousStatus, nextStatus)) {
      throw new APIError(
        `Fallback origin cannot move from ${previousStatus} to ${nextStatus}.`,
        409,
      )
    }
  }

  return {
    ...next,
    hostname,
    status: nextStatus,
    ...(operation === 'create' ? { verificationToken: fallbackOriginVerificationToken() } : {}),
    workspace: relationshipInput(workspaceID),
  }
}

export async function beginFallbackOriginVerification(input: {
  id: number | string
  payload: Payload
  req: PayloadRequest
}): Promise<FallbackOriginLifecycleResult> {
  const origin = await loadOrigin(input.payload, input.req, input.id)
  if (origin.status !== 'pending' && origin.status !== 'verified') {
    return {
      ok: false,
      code: 'INVALID_STATE',
      message: 'Fallback-origin verification can begin only from pending or verified.',
      origin,
    }
  }

  return {
    ok: true,
    origin: await updateOrigin(input.payload, input.req, input.id, {
      lastCheckedAt: new Date().toISOString(),
      lastVerificationError: null,
      status: 'verifying',
    }),
  }
}

export async function verifyFallbackOriginWithProvider(input: {
  id: number | string
  payload: Payload
  provider: DNSOwnershipEvidenceProvider
  req: PayloadRequest
}): Promise<FallbackOriginLifecycleResult> {
  const origin = await loadOrigin(input.payload, input.req, input.id)
  if (origin.status !== 'verifying') {
    return {
      ok: false,
      code: 'INVALID_STATE',
      message: 'DNS evidence is accepted only while the fallback origin is verifying.',
      origin,
    }
  }

  const instructions = buildFallbackOriginInstructions(origin)
  if (!instructions)
    throw new APIError('Fallback-origin verification instructions are invalid.', 500)

  // This is the only provider call: fixed-record TXT lookup, never an arbitrary URL fetch.
  let evidence: ReturnType<typeof boundedEvidence>
  try {
    evidence = boundedEvidence(instructions.name, await input.provider.lookupTXT(instructions.name))
  } catch {
    const checkedAt = new Date().toISOString()
    const message = 'The trusted DNS verification provider is temporarily unavailable.'
    const updated = await updateOrigin(input.payload, input.req, input.id, {
      lastCheckedAt: checkedAt,
      lastVerificationError: message,
      status: 'pending',
    })
    return {
      ok: false,
      code: 'DNS_PROVIDER_UNAVAILABLE',
      message,
      origin: updated,
    }
  }
  const checkedAt = new Date().toISOString()
  const snapshot = {
    observedAt: evidence.observedAt,
    recordName: evidence.recordName,
    valueHashes: evidence.valueHashes,
  }
  const result = evaluateFallbackOriginEvidence(instructions, {
    txtValues: evidence.txtValues,
  })
  if (!result.ok) {
    const updated = await updateOrigin(input.payload, input.req, input.id, {
      lastCheckedAt: checkedAt,
      lastEvidence: snapshot,
      lastVerificationError: result.message,
      status: 'pending',
    })
    return {
      ok: false,
      code: 'DNS_EVIDENCE_REJECTED',
      message: result.message,
      origin: updated,
    }
  }

  return {
    ok: true,
    origin: await updateOrigin(input.payload, input.req, input.id, {
      lastCheckedAt: checkedAt,
      lastEvidence: snapshot,
      lastVerificationError: null,
      revokedAt: null,
      status: 'verified',
      verifiedAt: checkedAt,
    }),
  }
}

export async function revokeFallbackOrigin(input: {
  id: number | string
  payload: Payload
  req: PayloadRequest
}): Promise<FallbackOriginLifecycleResult> {
  const origin = await loadOrigin(input.payload, input.req, input.id)
  if (origin.status === 'revoked') return { ok: true, origin }

  return {
    ok: true,
    origin: await updateOrigin(input.payload, input.req, input.id, {
      lastVerificationError: null,
      revokedAt: new Date().toISOString(),
      status: 'revoked',
    }),
  }
}

export function fallbackOriginVerificationToken(): string {
  return randomBytes(32).toString('base64url')
}
