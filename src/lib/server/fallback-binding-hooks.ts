import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionBeforeDeleteHook,
  CollectionBeforeValidateHook,
  PayloadRequest,
} from 'payload'
import { APIError } from 'payload'

import { canonicalizeFallbackURL } from '@/lib/domain/fallback-url-safety'
import { getLinksetGoEdition } from './deployment-edition'
import { applyFallbackBinding, garbageCollectFallbackBinding } from './fallback-binding-service'
import { relationID } from './tenant-context'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const selected = (
  next: Record<string, unknown>,
  previous: Record<string, unknown>,
  field: string,
): unknown => (Object.hasOwn(next, field) ? next[field] : previous[field])

const relationshipInput = (id: string): number | string => (/^\d+$/.test(id) ? Number(id) : id)

const optionalFallbackURL = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null

async function workspaceForApp(input: {
  app: unknown
  req: PayloadRequest
}): Promise<string | null> {
  if (isRecord(input.app)) {
    const populatedWorkspaceID = relationID(input.app.workspace)
    if (populatedWorkspaceID) return populatedWorkspaceID
  }
  const appID = relationID(input.app)
  if (!appID) return null
  const app = await input.req.payload.findByID({
    collection: 'apps',
    id: relationshipInput(appID),
    depth: 0,
    overrideAccess: true,
    req: input.req,
  })
  return relationID(app.workspace)
}

function sameBinding(
  leftURL: unknown,
  leftWorkspace: string | null,
  rightURL: unknown,
  rightWorkspace: string | null,
): boolean {
  if (!leftWorkspace || !rightWorkspace || leftWorkspace !== rightWorkspace) return false
  const left = canonicalizeFallbackURL(leftURL)
  const right = canonicalizeFallbackURL(rightURL)
  return left.ok && right.ok && left.value.canonicalUrl === right.value.canonicalUrl
}

export const applyAppFallbackBinding: CollectionBeforeValidateHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (getLinksetGoEdition() === 'community') return data
  const next = isRecord(data) ? data : {}
  const previous = isRecord(originalDoc) ? originalDoc : {}
  const nextWorkspaceID = relationID(selected(next, previous, 'workspace'))
  const previousWorkspaceID = relationID(previous.workspace)
  const fallbackWasSelected = operation === 'create' || Object.hasOwn(next, 'fallbackUrl')
  const workspaceChanged =
    operation === 'update' &&
    !!nextWorkspaceID &&
    !!previousWorkspaceID &&
    nextWorkspaceID !== previousWorkspaceID
  if (!fallbackWasSelected && !workspaceChanged) return data

  const fallbackUrl = optionalFallbackURL(selected(next, previous, 'fallbackUrl'))
  if (!fallbackUrl) {
    return Object.hasOwn(next, 'fallbackUrl') ? { ...next, fallbackUrl: null } : data
  }
  if (!nextWorkspaceID) throw new APIError('A fallback URL requires a workspace.', 400)

  const binding = await applyFallbackBinding({
    payload: req.payload,
    ...(operation === 'update' && previousWorkspaceID && previous.fallbackUrl
      ? {
          replaces: {
            url: previous.fallbackUrl,
            workspaceID: previousWorkspaceID,
          },
        }
      : {}),
    req,
    url: fallbackUrl,
    workspaceID: nextWorkspaceID,
  })
  return { ...next, fallbackUrl: binding.canonicalUrl }
}

export const applyDeepLinkFallbackBinding: CollectionBeforeValidateHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (getLinksetGoEdition() === 'community') return data
  const next = isRecord(data) ? data : {}
  const previous = isRecord(originalDoc) ? originalDoc : {}
  const appWasSelected = operation === 'update' && Object.hasOwn(next, 'app')
  if (operation !== 'create' && !Object.hasOwn(next, 'fallbackUrl') && !appWasSelected) {
    return data
  }

  const fallbackUrl = optionalFallbackURL(selected(next, previous, 'fallbackUrl'))
  if (!fallbackUrl) {
    return Object.hasOwn(next, 'fallbackUrl') ? { ...next, fallbackUrl: null } : data
  }
  const workspaceID = await workspaceForApp({
    app: selected(next, previous, 'app'),
    req,
  })
  if (!workspaceID) throw new APIError('A fallback URL requires an app workspace.', 400)
  const previousWorkspaceID =
    operation === 'update'
      ? await workspaceForApp({
          app: previous.app,
          req,
        })
      : null

  const binding = await applyFallbackBinding({
    payload: req.payload,
    ...(previousWorkspaceID && previous.fallbackUrl
      ? {
          replaces: {
            url: previous.fallbackUrl,
            workspaceID: previousWorkspaceID,
          },
        }
      : {}),
    req,
    url: fallbackUrl,
    workspaceID,
  })
  return { ...next, fallbackUrl: binding.canonicalUrl }
}

export const cleanupReplacedAppFallbackBinding: CollectionAfterChangeHook = async ({
  doc,
  operation,
  previousDoc,
  req,
}) => {
  if (getLinksetGoEdition() === 'community' || operation !== 'update') return doc
  const previous = isRecord(previousDoc) ? previousDoc : {}
  const current = isRecord(doc) ? doc : {}
  const previousURL = optionalFallbackURL(previous.fallbackUrl)
  if (!previousURL) return doc
  const previousWorkspaceID = relationID(previous.workspace)
  const currentWorkspaceID = relationID(current.workspace)
  if (sameBinding(previousURL, previousWorkspaceID, current.fallbackUrl, currentWorkspaceID)) {
    return doc
  }
  if (previousWorkspaceID) {
    await garbageCollectFallbackBinding({
      payload: req.payload,
      req,
      url: previousURL,
      workspaceID: previousWorkspaceID,
    })
  }
  return doc
}

export const cleanupDeletedAppFallbackBinding: CollectionAfterDeleteHook = async ({ doc, req }) => {
  if (getLinksetGoEdition() === 'community') return doc
  const deleted = isRecord(doc) ? doc : {}
  const fallbackUrl = optionalFallbackURL(deleted.fallbackUrl)
  const workspaceID = relationID(deleted.workspace)
  if (fallbackUrl && workspaceID) {
    await garbageCollectFallbackBinding({
      payload: req.payload,
      req,
      url: fallbackUrl,
      workspaceID,
    })
  }
  return doc
}

export const cleanupReplacedDeepLinkFallbackBinding: CollectionAfterChangeHook = async ({
  doc,
  operation,
  previousDoc,
  req,
}) => {
  if (getLinksetGoEdition() === 'community' || operation !== 'update') return doc
  const previous = isRecord(previousDoc) ? previousDoc : {}
  const current = isRecord(doc) ? doc : {}
  const previousURL = optionalFallbackURL(previous.fallbackUrl)
  if (!previousURL) return doc
  const previousWorkspaceID = await workspaceForApp({ app: previous.app, req })
  const currentWorkspaceID = await workspaceForApp({ app: current.app, req })
  if (sameBinding(previousURL, previousWorkspaceID, current.fallbackUrl, currentWorkspaceID)) {
    return doc
  }
  if (previousWorkspaceID) {
    await garbageCollectFallbackBinding({
      payload: req.payload,
      req,
      url: previousURL,
      workspaceID: previousWorkspaceID,
    })
  }
  return doc
}

export const cleanupDeletedDeepLinkFallbackBinding: CollectionAfterDeleteHook = async ({
  doc,
  req,
}) => {
  if (getLinksetGoEdition() === 'community') return doc
  const deleted = isRecord(doc) ? doc : {}
  const fallbackUrl = optionalFallbackURL(deleted.fallbackUrl)
  const workspaceID = fallbackUrl
    ? await workspaceForApp({ app: deleted.app, req }).catch(() => null)
    : null
  if (fallbackUrl && workspaceID) {
    await garbageCollectFallbackBinding({
      payload: req.payload,
      req,
      url: fallbackUrl,
      workspaceID,
    })
  }
  return doc
}

export const cleanupFallbackOriginAssessments: CollectionBeforeDeleteHook = async ({ id, req }) => {
  await req.payload.delete({
    collection: 'fallback-url-safety-assessments',
    overrideAccess: true,
    req,
    where: { origin: { equals: id } },
  })
}
