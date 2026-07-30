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
  outageGraceExpiresAt?: null | string
  revokedAt?: null | string
  status: FallbackOriginStatus
  verificationToken: string
  verificationExpiresAt?: null | string
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
export const fallbackOriginDNSFreshnessDefaults = {
  evidenceMaxAgeMs: 24 * 60 * 60 * 1_000,
  outageGraceMs: 6 * 60 * 60 * 1_000,
} as const

const minimumEvidenceMaxAgeMs = 60 * 60 * 1_000
const maximumEvidenceMaxAgeMs = 7 * 24 * 60 * 60 * 1_000
const maximumOutageGraceMs = 24 * 60 * 60 * 1_000

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
    'outageGraceExpiresAt',
    'revokedAt',
    'status',
    'verificationExpiresAt',
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
  if (
    !workspaceID ||
    (!lifecycleRequests.has(req) && !(await canAccessWorkspace(req, workspaceID, 'manage')))
  ) {
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
  const origin = await loadOriginUnchecked(payload, req, id)
  await assertWorkspaceManager(req, origin.workspace)
  return origin
}

async function loadOriginUnchecked(
  payload: Payload,
  req: PayloadRequest,
  id: number | string,
): Promise<FallbackOriginRecord> {
  return asFallbackOrigin(
    await payload.findByID({
      collection: 'fallback-origins',
      id,
      depth: 0,
      overrideAccess: true,
      req,
    }),
  )
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
  now?: Date
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
  const now = input.now ?? new Date()
  if (!Number.isFinite(now.getTime()))
    throw new APIError('A valid verification time is required.', 500)

  return {
    ok: true,
    origin: await updateOrigin(input.payload, input.req, input.id, {
      lastCheckedAt: now.toISOString(),
      lastVerificationError: null,
      status: 'verifying',
    }),
  }
}

function boundedDuration(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const selected = value ?? fallback
  return Number.isFinite(selected)
    ? Math.min(maximum, Math.max(minimum, Math.floor(selected)))
    : fallback
}

const optionalInstant = (value: unknown): number | null =>
  typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null

async function completeFallbackOriginVerification(input: {
  evidenceMaxAgeMs?: number
  now?: Date
  origin: FallbackOriginRecord
  outageGraceMs?: number
  payload: Payload
  provider: DNSOwnershipEvidenceProvider
  req: PayloadRequest
}): Promise<FallbackOriginLifecycleResult> {
  const { origin } = input
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

  const now = input.now ?? new Date()
  if (!Number.isFinite(now.getTime()))
    throw new APIError('A valid verification time is required.', 500)
  const checkedAt = now.toISOString()
  const evidenceMaxAgeMs = boundedDuration(
    input.evidenceMaxAgeMs,
    fallbackOriginDNSFreshnessDefaults.evidenceMaxAgeMs,
    minimumEvidenceMaxAgeMs,
    maximumEvidenceMaxAgeMs,
  )
  const outageGraceMs = boundedDuration(
    input.outageGraceMs,
    fallbackOriginDNSFreshnessDefaults.outageGraceMs,
    0,
    maximumOutageGraceMs,
  )

  // This is the only provider call: fixed-record TXT lookup, never an arbitrary URL fetch.
  let evidence: ReturnType<typeof boundedEvidence>
  try {
    evidence = boundedEvidence(instructions.name, await input.provider.lookupTXT(instructions.name))
  } catch {
    const message = 'The trusted DNS verification provider is temporarily unavailable.'
    const proofExpiry = optionalInstant(origin.verificationExpiresAt)
    const previousGraceExpiry = optionalInstant(origin.outageGraceExpiresAt)
    const configuredGraceExpiry =
      proofExpiry === null ? null : proofExpiry + Math.max(0, outageGraceMs)
    const graceExpiry =
      configuredGraceExpiry === null
        ? null
        : previousGraceExpiry === null
          ? configuredGraceExpiry
          : Math.min(previousGraceExpiry, configuredGraceExpiry)
    const graceActive =
      optionalInstant(origin.verifiedAt) !== null &&
      graceExpiry !== null &&
      now.getTime() < graceExpiry
    const updated = await updateOrigin(input.payload, input.req, origin.id, {
      lastCheckedAt: checkedAt,
      lastVerificationError: message,
      outageGraceExpiresAt: graceActive ? new Date(graceExpiry).toISOString() : null,
      status: graceActive ? 'verified' : 'pending',
    })
    return {
      ok: false,
      code: 'DNS_PROVIDER_UNAVAILABLE',
      message,
      origin: updated,
    }
  }
  const snapshot = {
    observedAt: evidence.observedAt,
    recordName: evidence.recordName,
    valueHashes: evidence.valueHashes,
  }
  const result = evaluateFallbackOriginEvidence(instructions, {
    txtValues: evidence.txtValues,
  })
  if (!result.ok) {
    const updated = await updateOrigin(input.payload, input.req, origin.id, {
      lastCheckedAt: checkedAt,
      lastEvidence: snapshot,
      lastVerificationError: result.message,
      outageGraceExpiresAt: null,
      status: 'pending',
      verificationExpiresAt: null,
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
    origin: await updateOrigin(input.payload, input.req, origin.id, {
      lastCheckedAt: checkedAt,
      lastEvidence: snapshot,
      lastVerificationError: null,
      outageGraceExpiresAt: null,
      revokedAt: null,
      status: 'verified',
      verificationExpiresAt: new Date(now.getTime() + evidenceMaxAgeMs).toISOString(),
      verifiedAt: checkedAt,
    }),
  }
}

export async function verifyFallbackOriginWithProvider(input: {
  evidenceMaxAgeMs?: number
  id: number | string
  now?: Date
  outageGraceMs?: number
  payload: Payload
  provider: DNSOwnershipEvidenceProvider
  req: PayloadRequest
}): Promise<FallbackOriginLifecycleResult> {
  return completeFallbackOriginVerification({
    ...input,
    origin: await loadOrigin(input.payload, input.req, input.id),
  })
}

export async function beginFallbackOriginReverification(input: {
  id: number | string
  now?: Date
  payload: Payload
  req: PayloadRequest
}): Promise<FallbackOriginLifecycleResult> {
  const existing = await loadOriginUnchecked(input.payload, input.req, input.id)
  if (existing.status !== 'verified' && existing.status !== 'verifying') {
    return {
      ok: false,
      code: 'INVALID_STATE',
      message: 'Scheduled DNS renewal requires a verified or recoverable origin.',
      origin: existing,
    }
  }
  const now = input.now ?? new Date()
  if (!Number.isFinite(now.getTime()))
    throw new APIError('A valid verification time is required.', 500)

  return {
    ok: true,
    origin: await updateOrigin(input.payload, input.req, input.id, {
      lastCheckedAt: now.toISOString(),
      lastVerificationError: null,
      status: 'verifying',
    }),
  }
}

export async function reverifyFallbackOriginWithProvider(input: {
  evidenceMaxAgeMs?: number
  id: number | string
  now?: Date
  outageGraceMs?: number
  payload: Payload
  provider: DNSOwnershipEvidenceProvider
  req: PayloadRequest
}): Promise<FallbackOriginLifecycleResult> {
  const existing = await loadOriginUnchecked(input.payload, input.req, input.id)
  if (existing.status !== 'verified' && existing.status !== 'verifying') {
    return {
      ok: false,
      code: 'INVALID_STATE',
      message: 'Scheduled DNS renewal requires a verified or recoverable origin.',
      origin: existing,
    }
  }
  const now = input.now ?? new Date()
  if (!Number.isFinite(now.getTime()))
    throw new APIError('A valid verification time is required.', 500)
  const origin =
    existing.status === 'verifying'
      ? existing
      : await updateOrigin(input.payload, input.req, input.id, {
          lastCheckedAt: now.toISOString(),
          lastVerificationError: null,
          status: 'verifying',
        })
  return completeFallbackOriginVerification({ ...input, now, origin })
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
      outageGraceExpiresAt: null,
      revokedAt: new Date().toISOString(),
      status: 'revoked',
      verificationExpiresAt: null,
    }),
  }
}

export function fallbackOriginVerificationToken(): string {
  return randomBytes(32).toString('base64url')
}
