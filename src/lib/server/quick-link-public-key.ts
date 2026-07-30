import 'server-only'

import { createHmac } from 'node:crypto'

import { isSharedPublicAppKey } from '@/lib/domain/deployment-surface'

const MAX_PUBLIC_KEY_LENGTH = 80
const SUFFIX_LENGTHS = [24, 32, 48] as const

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const candidateWithSuffix = (prefix: string, suffix: string): string => {
  const maximumPrefixLength = MAX_PUBLIC_KEY_LENGTH - suffix.length - 1
  const readablePrefix = prefix.slice(0, maximumPrefixLength).replace(/-+$/g, '') || 'app'
  return `${readablePrefix}-${suffix}`
}

/**
 * Builds stable public-key candidates for the untrusted quick-link workflow.
 *
 * The native scheme remains readable but can never become the complete global
 * key. The HMAC suffix is stable for a workspace, opaque to callers, and
 * domain-separated from other uses of the server secret.
 */
export function quickLinkPublicKeyCandidates(input: {
  eventHashSecret: string
  nativeScheme: string
  workspaceId: string
}): string[] {
  if (input.eventHashSecret.length < 32) {
    throw new Error('Quick-link public-key allocation requires a strong server secret.')
  }
  if (!input.workspaceId.trim()) {
    throw new Error('Quick-link public-key allocation requires a workspace.')
  }

  const prefix = slugify(input.nativeScheme)
  if (!prefix) {
    throw new Error('Quick-link public-key allocation requires a valid native scheme.')
  }
  const digest = createHmac('sha256', input.eventHashSecret)
    .update('linksetgo:quick-link-public-key:v1\0')
    .update(input.workspaceId)
    .digest('hex')

  return SUFFIX_LENGTHS.map((length) =>
    candidateWithSuffix(prefix, digest.slice(0, length)),
  ).filter(isSharedPublicAppKey)
}
