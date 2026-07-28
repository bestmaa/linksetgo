import { timingSafeEqual } from 'node:crypto'
import { isIP } from 'node:net'

import { normalizeHostname } from './workspace-domain'

export type FallbackOriginStatus = 'pending' | 'revoked' | 'verified' | 'verifying'

export type FallbackOriginInstructions = {
  name: string
  type: 'TXT'
  value: string
}

export type FallbackOriginDNSEvidence = {
  txtValues: readonly string[]
}

export type FallbackOriginEvidenceResult =
  | { ok: true }
  | {
      ok: false
      code: 'OWNERSHIP_CHALLENGE_MISSING'
      message: string
    }

const challengePrefix = 'relay-fallback-verification='
const transitions: Readonly<Record<FallbackOriginStatus, readonly FallbackOriginStatus[]>> = {
  pending: ['revoked', 'verifying'],
  revoked: [],
  verified: ['revoked', 'verifying'],
  verifying: ['pending', 'revoked', 'verified'],
}

const exactMatch = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

export function normalizeFallbackOriginHostname(value: unknown): string | null {
  const hostname = normalizeHostname(value)
  if (!hostname || hostname === 'localhost' || isIP(hostname) > 0 || !hostname.includes('.')) {
    return null
  }
  return hostname
}

export function buildFallbackOriginInstructions(input: {
  hostname: string
  verificationToken: string
}): FallbackOriginInstructions | null {
  const hostname = normalizeFallbackOriginHostname(input.hostname)
  const token = input.verificationToken.trim()
  if (!hostname || token.length < 24 || !/^[A-Za-z0-9_-]+$/.test(token)) return null

  return {
    name: `_relay-fallback.${hostname}`,
    type: 'TXT',
    value: `${challengePrefix}${token}`,
  }
}

export function evaluateFallbackOriginEvidence(
  instructions: FallbackOriginInstructions,
  evidence: FallbackOriginDNSEvidence,
): FallbackOriginEvidenceResult {
  const hasChallenge = evidence.txtValues
    .map((value) => value.trim().replace(/^"(.*)"$/, '$1'))
    .some((value) => exactMatch(value, instructions.value))

  return hasChallenge
    ? { ok: true }
    : {
        ok: false,
        code: 'OWNERSHIP_CHALLENGE_MISSING',
        message: 'The expected fallback-origin DNS TXT challenge was not observed.',
      }
}

export function canTransitionFallbackOrigin(
  from: FallbackOriginStatus,
  to: FallbackOriginStatus,
): boolean {
  return from === to || transitions[from].includes(to)
}
