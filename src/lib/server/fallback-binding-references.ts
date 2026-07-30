import type { Payload, PayloadRequest } from 'payload'

import { canonicalizeFallbackURL } from '@/lib/domain/fallback-url-safety'
import { relationID } from './tenant-context'

const pageSize = 500

const relationshipInput = (id: string): number | string => (/^\d+$/.test(id) ? Number(id) : id)

const matchesCanonicalURL = (value: unknown, canonicalUrl: string): boolean => {
  const candidate = canonicalizeFallbackURL(value)
  return candidate.ok && candidate.value.canonicalUrl === canonicalUrl
}

const matchesHostname = (value: unknown, hostname: string): boolean => {
  const candidate = canonicalizeFallbackURL(value)
  return candidate.ok && candidate.value.hostname === hostname
}

async function workspaceApps(input: {
  matches: (value: unknown) => boolean
  payload: Payload
  req: PayloadRequest
  workspaceID: string
}): Promise<{ appIDs: Array<number | string>; references: number }> {
  const appIDs: Array<number | string> = []
  let references = 0
  let page = 1

  while (true) {
    const result = await input.payload.find({
      collection: 'apps',
      depth: 0,
      limit: pageSize,
      overrideAccess: true,
      page,
      req: input.req,
      sort: 'id',
      where: { workspace: { equals: relationshipInput(input.workspaceID) } },
    })
    for (const app of result.docs) {
      appIDs.push(app.id)
      if (input.matches(app.fallbackUrl)) references += 1
    }
    if (!result.hasNextPage) return { appIDs, references }
    page = result.nextPage ?? page + 1
  }
}

async function linkReferenceCount(input: {
  appIDs: readonly (number | string)[]
  matches: (value: unknown) => boolean
  payload: Payload
  req: PayloadRequest
}): Promise<number> {
  if (input.appIDs.length === 0) return 0

  let references = 0
  for (let offset = 0; offset < input.appIDs.length; offset += pageSize) {
    const appIDs = input.appIDs.slice(offset, offset + pageSize)
    let page = 1
    while (true) {
      const result = await input.payload.find({
        collection: 'deep-links',
        depth: 0,
        limit: pageSize,
        overrideAccess: true,
        page,
        req: input.req,
        sort: 'id',
        where: {
          and: [{ app: { in: appIDs } }, { fallbackUrl: { exists: true } }],
        },
      })
      references += result.docs.filter((link) => input.matches(link.fallbackUrl)).length
      if (!result.hasNextPage) break
      page = result.nextPage ?? page + 1
    }
  }
  return references
}

/**
 * Performs a canonical comparison rather than relying on raw URL equality so
 * that pre-canonicalization records remain protected during the safety
 * backfill and later garbage collection.
 */
export async function countLiveFallbackURLReferences(input: {
  canonicalUrl: string
  payload: Payload
  req: PayloadRequest
  workspaceID: number | string
}): Promise<number> {
  const workspaceID = relationID(input.workspaceID)
  const canonical = canonicalizeFallbackURL(input.canonicalUrl)
  if (!workspaceID || !canonical.ok || canonical.value.canonicalUrl !== input.canonicalUrl) {
    throw new Error('A canonical fallback URL and workspace are required.')
  }

  const apps = await workspaceApps({
    matches: (value) => matchesCanonicalURL(value, input.canonicalUrl),
    payload: input.payload,
    req: input.req,
    workspaceID,
  })
  return (
    apps.references +
    (await linkReferenceCount({
      appIDs: apps.appIDs,
      matches: (value) => matchesCanonicalURL(value, input.canonicalUrl),
      payload: input.payload,
      req: input.req,
    }))
  )
}

export async function hasLiveFallbackURLReference(
  input: Parameters<typeof countLiveFallbackURLReferences>[0],
): Promise<boolean> {
  return (await countLiveFallbackURLReferences(input)) > 0
}

export async function hasLiveFallbackHostnameReference(input: {
  hostname: string
  payload: Payload
  req: PayloadRequest
  workspaceID: number | string
}): Promise<boolean> {
  const workspaceID = relationID(input.workspaceID)
  if (!workspaceID || !input.hostname) {
    throw new Error('A fallback hostname and workspace are required.')
  }
  const apps = await workspaceApps({
    matches: (value) => matchesHostname(value, input.hostname),
    payload: input.payload,
    req: input.req,
    workspaceID,
  })
  if (apps.references > 0) return true
  return (
    (await linkReferenceCount({
      appIDs: apps.appIDs,
      matches: (value) => matchesHostname(value, input.hostname),
      payload: input.payload,
      req: input.req,
    })) > 0
  )
}
