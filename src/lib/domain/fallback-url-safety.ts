import { createHash } from 'node:crypto'
import { isIP } from 'node:net'

import { normalizeHostname } from './workspace-domain'

export const fallbackURLThreats = [
  'malware',
  'phishing',
  'social-engineering',
  'unwanted-software',
  'other',
] as const

export type FallbackURLThreat = (typeof fallbackURLThreats)[number]
export type FallbackURLSafetyStatus = 'checking' | 'error' | 'pending' | 'safe' | 'unsafe'

export type CanonicalFallbackURL = {
  canonicalUrl: string
  hostname: string
}

export type CanonicalFallbackURLResult =
  | { ok: true; value: CanonicalFallbackURL }
  | {
      code:
        | 'CREDENTIALS_NOT_ALLOWED'
        | 'FRAGMENT_NOT_ALLOWED'
        | 'INVALID_HOSTNAME'
        | 'INVALID_URL'
        | 'PORT_NOT_ALLOWED'
        | 'PUBLIC_HOST_REQUIRED'
        | 'TOO_LONG'
        | 'UNSAFE_CHARACTERS'
        | 'UNSUPPORTED_PROTOCOL'
      message: string
      ok: false
    }

export type FallbackURLSafetyAssessment = CanonicalFallbackURL & {
  checkedAt: null | string
  expiresAt: null | string
  lastError: null | string
  providerObservedAt: null | string
  redirectCount: number
  status: FallbackURLSafetyStatus
  threats: readonly FallbackURLThreat[]
  workspaceId: string
}

export type FallbackURLSafetyReadiness =
  | { ok: true; canonicalUrl: string }
  | {
      ok: false
      reason:
        | 'checking'
        | 'error'
        | 'ownership-revoked'
        | 'ownership-unverified'
        | 'pending'
        | 'stale'
        | 'unsafe'
        | 'workspace-mismatch'
    }

export type URLSafetyCompletion =
  | {
      kind: 'error'
      message: string
      observedAt?: string
    }
  | {
      expiresAt?: string
      kind: 'safe'
      observedAt: string
      redirectCount: number
    }
  | {
      expiresAt?: string
      kind: 'unsafe'
      observedAt: string
      redirectCount: number
      threats: readonly FallbackURLThreat[]
    }

const maximumFallbackURLLength = 2_048
const maximumSafetyTTLMilliseconds = 7 * 24 * 60 * 60 * 1_000
const minimumSafetyTTLMilliseconds = 5 * 60 * 1_000
const maximumProviderObservationAgeMilliseconds = 5 * 60 * 1_000
const maximumProviderClockSkewMilliseconds = 2 * 60 * 1_000
const unsafeCharacterPattern = /[\u0000-\u0020\u007f\\]/

const errorResult = (
  code: Extract<CanonicalFallbackURLResult, { ok: false }>['code'],
  message: string,
): Extract<CanonicalFallbackURLResult, { ok: false }> => ({ code, message, ok: false })

function rawAuthority(value: string): string | null {
  const match = /^https:\/\/([^/?#]*)/i.exec(value)
  return match?.[1] ?? null
}

function hasExplicitPort(authority: string): boolean {
  const host = authority.includes('@') ? authority.slice(authority.lastIndexOf('@') + 1) : authority
  if (host.startsWith('[')) return host.includes(']:')
  return host.includes(':')
}

export function canonicalizeFallbackURL(value: unknown): CanonicalFallbackURLResult {
  if (typeof value !== 'string') {
    return errorResult('INVALID_URL', 'Enter one absolute HTTPS fallback URL.')
  }
  const candidate = value.trim()
  if (!candidate) return errorResult('INVALID_URL', 'Enter one absolute HTTPS fallback URL.')
  if (candidate.length > maximumFallbackURLLength) {
    return errorResult('TOO_LONG', 'Fallback URLs must be 2048 characters or fewer.')
  }
  if (unsafeCharacterPattern.test(candidate)) {
    return errorResult(
      'UNSAFE_CHARACTERS',
      'Fallback URLs cannot contain whitespace, control characters, or backslashes.',
    )
  }

  let parsed: URL
  try {
    parsed = new URL(candidate)
  } catch {
    return errorResult('INVALID_URL', 'Enter one absolute HTTPS fallback URL.')
  }
  if (parsed.protocol !== 'https:') {
    return errorResult('UNSUPPORTED_PROTOCOL', 'Fallback URLs must use HTTPS.')
  }
  if (parsed.username || parsed.password) {
    return errorResult('CREDENTIALS_NOT_ALLOWED', 'Fallback URLs cannot contain credentials.')
  }
  const authority = rawAuthority(candidate)
  if (!authority) return errorResult('INVALID_URL', 'Enter one absolute HTTPS fallback URL.')
  if (parsed.port || hasExplicitPort(authority)) {
    return errorResult('PORT_NOT_ALLOWED', 'Fallback URLs cannot contain an explicit port.')
  }
  if (parsed.hash) {
    return errorResult('FRAGMENT_NOT_ALLOWED', 'Fallback URLs cannot contain a fragment.')
  }

  const parsedIPCandidate = parsed.hostname.startsWith('[')
    ? parsed.hostname.slice(1, -1)
    : parsed.hostname
  if (isIP(parsedIPCandidate) > 0) {
    return errorResult(
      'PUBLIC_HOST_REQUIRED',
      'Fallback URLs require a public fully-qualified hostname, not localhost or an IP address.',
    )
  }
  const hostname = normalizeHostname(parsed.hostname)
  if (!hostname) {
    return errorResult('INVALID_HOSTNAME', 'Fallback URLs require a valid public hostname.')
  }
  const ipCandidate = hostname.startsWith('[') ? hostname.slice(1, -1) : hostname
  if (hostname === 'localhost' || isIP(ipCandidate) > 0 || !hostname.includes('.')) {
    return errorResult(
      'PUBLIC_HOST_REQUIRED',
      'Fallback URLs require a public fully-qualified hostname, not localhost or an IP address.',
    )
  }

  parsed.hostname = hostname
  parsed.port = ''
  parsed.hash = ''
  const canonicalUrl = parsed.toString()
  if (canonicalUrl.length > maximumFallbackURLLength) {
    return errorResult('TOO_LONG', 'Fallback URLs must be 2048 characters or fewer.')
  }
  return { ok: true, value: { canonicalUrl, hostname } }
}

export function fallbackURLAssessmentHash(workspaceId: string, canonicalUrl: string): string {
  return createHash('sha256').update(`${workspaceId}\0${canonicalUrl}`).digest('hex')
}

export function pendingFallbackURLSafetyAssessment(input: {
  canonicalUrl: string
  hostname: string
  workspaceId: string
}): FallbackURLSafetyAssessment {
  return {
    canonicalUrl: input.canonicalUrl,
    checkedAt: null,
    expiresAt: null,
    hostname: input.hostname,
    lastError: null,
    providerObservedAt: null,
    redirectCount: 0,
    status: 'pending',
    threats: [],
    workspaceId: input.workspaceId,
  }
}

export function beginFallbackURLSafetyAssessment(
  assessment: FallbackURLSafetyAssessment,
): FallbackURLSafetyAssessment {
  return {
    ...assessment,
    lastError: null,
    status: 'checking',
  }
}

const validInstant = (value: string): boolean => Number.isFinite(Date.parse(value))

const boundedError = (value: string): string => {
  const trimmed = value.trim()
  return (trimmed || 'The URL safety provider is unavailable.').slice(0, 500)
}

const boundedThreats = (values: readonly FallbackURLThreat[]): FallbackURLThreat[] =>
  [...new Set(values.filter((value) => fallbackURLThreats.includes(value)))].slice(
    0,
    fallbackURLThreats.length,
  )

export function completeFallbackURLSafetyAssessment(input: {
  assessment: FallbackURLSafetyAssessment
  completion: URLSafetyCompletion
  maxAgeMs: number
  now?: Date
}): FallbackURLSafetyAssessment {
  if (input.assessment.status !== 'checking') {
    throw new Error('A fallback URL safety result is accepted only while checking.')
  }
  const now = input.now ?? new Date()
  if (!Number.isFinite(now.getTime())) throw new Error('A valid safety-check time is required.')
  const checkedAt = now.toISOString()

  if (input.completion.kind === 'error') {
    return {
      ...input.assessment,
      checkedAt,
      expiresAt: null,
      lastError: boundedError(input.completion.message),
      providerObservedAt:
        input.completion.observedAt && validInstant(input.completion.observedAt)
          ? new Date(input.completion.observedAt).toISOString()
          : null,
      status: 'error',
      threats: [],
    }
  }
  if (!validInstant(input.completion.observedAt)) {
    throw new Error('The URL safety provider returned an invalid observation time.')
  }
  const providerObservedAtMilliseconds = Date.parse(input.completion.observedAt)
  if (
    providerObservedAtMilliseconds < now.getTime() - maximumProviderObservationAgeMilliseconds ||
    providerObservedAtMilliseconds > now.getTime() + maximumProviderClockSkewMilliseconds
  ) {
    throw new Error('The URL safety provider returned a stale or future-dated observation.')
  }

  const maxAgeMs = Math.min(
    maximumSafetyTTLMilliseconds,
    Math.max(minimumSafetyTTLMilliseconds, Math.floor(input.maxAgeMs)),
  )
  const configuredExpiry = now.getTime() + maxAgeMs
  const providerExpiry =
    input.completion.expiresAt && validInstant(input.completion.expiresAt)
      ? Date.parse(input.completion.expiresAt)
      : configuredExpiry
  const expiresAt = new Date(Math.min(configuredExpiry, providerExpiry)).toISOString()
  const providerObservedAt = new Date(input.completion.observedAt).toISOString()
  const redirectCount = Math.max(0, Math.min(10, Math.floor(input.completion.redirectCount)))

  if (input.completion.kind === 'safe') {
    return {
      ...input.assessment,
      checkedAt,
      expiresAt,
      lastError: null,
      providerObservedAt,
      redirectCount,
      status: 'safe',
      threats: [],
    }
  }

  const threats = boundedThreats(input.completion.threats)
  return {
    ...input.assessment,
    checkedAt,
    expiresAt,
    lastError: null,
    providerObservedAt,
    redirectCount,
    status: 'unsafe',
    threats: threats.length > 0 ? threats : ['other'],
  }
}

export function evaluateFallbackURLSafetyReadiness(input: {
  assessment: FallbackURLSafetyAssessment
  now?: Date
  originStatus: string
  workspaceId: string
}): FallbackURLSafetyReadiness {
  if (input.assessment.workspaceId !== input.workspaceId) {
    return { ok: false, reason: 'workspace-mismatch' }
  }
  if (input.originStatus === 'revoked') {
    return { ok: false, reason: 'ownership-revoked' }
  }
  if (input.originStatus !== 'verified') {
    return { ok: false, reason: 'ownership-unverified' }
  }
  if (input.assessment.status !== 'safe') {
    return {
      ok: false,
      reason: input.assessment.status,
    }
  }

  const now = input.now ?? new Date()
  const checkedAt = input.assessment.checkedAt ? Date.parse(input.assessment.checkedAt) : Number.NaN
  const expiresAt = input.assessment.expiresAt ? Date.parse(input.assessment.expiresAt) : Number.NaN
  if (
    !Number.isFinite(now.getTime()) ||
    !Number.isFinite(checkedAt) ||
    !Number.isFinite(expiresAt) ||
    checkedAt > now.getTime() ||
    expiresAt <= now.getTime()
  ) {
    return { ok: false, reason: 'stale' }
  }
  return { ok: true, canonicalUrl: input.assessment.canonicalUrl }
}
