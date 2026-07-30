import 'server-only'

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

import { isPublicSlug } from '@/lib/domain/public-link'
import { normalizeHostname } from '@/lib/domain/workspace-domain'

export const LINK_EVENT_TOKEN_TTL_MS = 10 * 60 * 1_000
const maximumTokenLength = 1_024
const maximumClockSkewMs = 30 * 1_000
const noncePattern = /^[A-Za-z0-9_-]{24}$/
const resourceKeyPattern = /^[a-f0-9]{64}$/

export type LinkEventTokenClaims = Readonly<{
  appSlug: string
  expiresAt: number
  hostname: string
  issuedAt: number
  linkSlug: string
  nonce: string
  resourceKey: string
}>

type MintInput = {
  appID: number
  appSlug: string
  eventHashSecret: string
  hostname: string
  linkID: number
  linkSlug: string
  nonce?: string
  now?: Date
}

type VerifyInput = {
  appSlug: string
  eventHashSecret: string
  hostname: string
  linkSlug: string
  now?: Date
  token: string
}

const signingInput = (payload: string): string => `v1.${payload}`

function signature(payload: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(signingInput(payload)).digest()
}

const positiveID = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0

export function linkEventResourceKey(
  appID: number,
  linkID: number,
  eventHashSecret: string,
): string {
  if (!positiveID(appID) || !positiveID(linkID)) {
    throw new Error('Cannot bind an event token to an invalid public link.')
  }
  return createHmac('sha256', eventHashSecret)
    .update(`link-event-resource:${appID}:${linkID}`)
    .digest('hex')
}

function parseClaims(value: unknown): LinkEventTokenClaims | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const claims = value as Record<string, unknown>
  if (
    Object.keys(claims).length !== 7 ||
    typeof claims.appSlug !== 'string' ||
    !isPublicSlug(claims.appSlug) ||
    typeof claims.linkSlug !== 'string' ||
    !isPublicSlug(claims.linkSlug) ||
    typeof claims.hostname !== 'string' ||
    normalizeHostname(claims.hostname) !== claims.hostname ||
    typeof claims.nonce !== 'string' ||
    !noncePattern.test(claims.nonce) ||
    typeof claims.resourceKey !== 'string' ||
    !resourceKeyPattern.test(claims.resourceKey) ||
    typeof claims.issuedAt !== 'number' ||
    !Number.isSafeInteger(claims.issuedAt) ||
    typeof claims.expiresAt !== 'number' ||
    !Number.isSafeInteger(claims.expiresAt)
  ) {
    return null
  }
  return claims as LinkEventTokenClaims
}

export function mintLinkEventToken(input: MintInput): string {
  const now = input.now ?? new Date()
  const issuedAt = now.getTime()
  const hostname = normalizeHostname(input.hostname)
  const nonce = input.nonce ?? randomBytes(18).toString('base64url')
  if (
    !Number.isFinite(issuedAt) ||
    !positiveID(input.appID) ||
    !positiveID(input.linkID) ||
    !isPublicSlug(input.appSlug) ||
    !isPublicSlug(input.linkSlug) ||
    !hostname ||
    !noncePattern.test(nonce)
  ) {
    throw new Error('Cannot mint an event token for an invalid public link.')
  }

  const claims: LinkEventTokenClaims = {
    appSlug: input.appSlug,
    expiresAt: issuedAt + LINK_EVENT_TOKEN_TTL_MS,
    hostname,
    issuedAt,
    linkSlug: input.linkSlug,
    nonce,
    resourceKey: linkEventResourceKey(input.appID, input.linkID, input.eventHashSecret),
  }
  const payload = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url')
  return `${signingInput(payload)}.${signature(payload, input.eventHashSecret).toString('base64url')}`
}

export function verifyLinkEventToken(input: VerifyInput): LinkEventTokenClaims | null {
  if (!input.token || input.token.length > maximumTokenLength) return null
  const parts = input.token.split('.')
  if (parts.length !== 3 || parts[0] !== 'v1') return null
  const payload = parts[1]
  const suppliedSignature = parts[2]
  if (!payload || !suppliedSignature) return null

  let supplied: Buffer
  let decoded: Buffer
  try {
    supplied = Buffer.from(suppliedSignature, 'base64url')
    decoded = Buffer.from(payload, 'base64url')
  } catch {
    return null
  }
  const expected = signature(payload, input.eventHashSecret)
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected) ||
    decoded.toString('base64url') !== payload
  ) {
    return null
  }

  let claims: LinkEventTokenClaims | null = null
  try {
    claims = parseClaims(JSON.parse(decoded.toString('utf8')) as unknown)
  } catch {
    return null
  }
  if (!claims) return null

  const now = (input.now ?? new Date()).getTime()
  const hostname = normalizeHostname(input.hostname)
  if (
    !Number.isFinite(now) ||
    !hostname ||
    claims.hostname !== hostname ||
    claims.appSlug !== input.appSlug ||
    claims.linkSlug !== input.linkSlug ||
    claims.issuedAt > now + maximumClockSkewMs ||
    claims.expiresAt <= now ||
    claims.expiresAt <= claims.issuedAt ||
    claims.expiresAt - claims.issuedAt > LINK_EVENT_TOKEN_TTL_MS
  ) {
    return null
  }
  return claims
}
