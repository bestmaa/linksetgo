import {
  APIError,
  type CollectionBeforeValidateHook,
  type Payload,
  type PayloadRequest,
} from 'payload'

import { getRelayEdition } from './deployment-edition'
import { fallbackHostnameFromURL, normalizedFallbackHostnames } from './collection-guards'
import { relationID } from './tenant-context'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const selected = (
  next: Record<string, unknown>,
  previous: Record<string, unknown>,
  field: string,
): unknown => (Object.hasOwn(next, field) ? next[field] : previous[field])

const relationshipInput = (id: string): number | string => (/^\d+$/.test(id) ? Number(id) : id)

export async function findUnverifiedFallbackHostnames(input: {
  hostnames: readonly string[]
  payload: Payload
  req?: PayloadRequest
  workspaceID: string
}): Promise<string[]> {
  const required = [...new Set(normalizedFallbackHostnames(input.hostnames))]
  if (required.length === 0) return []

  const result = await input.payload.find({
    collection: 'fallback-origins',
    depth: 0,
    limit: Math.min(required.length, 100),
    overrideAccess: true,
    pagination: false,
    ...(input.req ? { req: input.req } : {}),
    where: {
      and: [
        { workspace: { equals: relationshipInput(input.workspaceID) } },
        { hostname: { in: required } },
        { status: { equals: 'verified' } },
      ],
    },
  })
  const verified = new Set(
    result.docs.flatMap((origin) =>
      typeof origin.hostname === 'string' ? [origin.hostname.toLowerCase()] : [],
    ),
  )
  return required.filter((hostname) => !verified.has(hostname))
}

export async function areCloudFallbackOriginsReady(input: {
  fallbackURLs: readonly (null | string | undefined)[]
  payload: Payload
  req?: PayloadRequest
  workspace: unknown
}): Promise<boolean> {
  if (getRelayEdition() !== 'cloud') return true

  const workspaceID = relationID(input.workspace)
  if (!workspaceID) return false
  const hostnames = input.fallbackURLs.flatMap((value) => {
    const hostname = fallbackHostnameFromURL(value)
    return hostname ? [hostname] : []
  })
  if (hostnames.length !== input.fallbackURLs.filter(Boolean).length) return false

  return (
    (
      await findUnverifiedFallbackHostnames({
        hostnames,
        payload: input.payload,
        ...(input.req ? { req: input.req } : {}),
        workspaceID,
      })
    ).length === 0
  )
}

export const enforceCloudAppFallbackOrigins: CollectionBeforeValidateHook = async ({
  data,
  originalDoc,
  req,
}) => {
  if (getRelayEdition() !== 'cloud') return data

  const next = isRecord(data) ? data : {}
  const previous = isRecord(originalDoc) ? originalDoc : {}
  if (selected(next, previous, 'status') !== 'active') return data

  const workspaceID = relationID(selected(next, previous, 'workspace'))
  if (!workspaceID) {
    throw new APIError('A Cloud app must belong to a workspace before activation.', 422)
  }

  const defaultHostname = fallbackHostnameFromURL(selected(next, previous, 'fallbackUrl'))
  const allowedHostnames = normalizedFallbackHostnames(
    selected(next, previous, 'allowedFallbackHosts'),
  )
  const required = [...new Set(defaultHostname ? [...allowedHostnames, defaultHostname] : [])]
  if (!defaultHostname || required.length === 0) {
    throw new APIError('A valid HTTPS fallback URL is required before activation.', 422)
  }

  const missing = await findUnverifiedFallbackHostnames({
    hostnames: required,
    payload: req.payload,
    req,
    workspaceID,
  })
  if (missing.length > 0) {
    throw new APIError(
      `Verify fallback origin ownership before activation: ${missing.join(', ')}.`,
      422,
    )
  }
  return data
}
