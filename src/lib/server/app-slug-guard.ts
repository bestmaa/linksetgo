import { APIError, type CollectionBeforeValidateHook } from 'payload'

import { acquireTransactionLock } from './postgres-lock'
import { relationID } from './tenant-context'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export const enforceWorkspaceAppSlug: CollectionBeforeValidateHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  const next = isRecord(data) ? data : {}
  const previous = isRecord(originalDoc) ? originalDoc : {}
  const slug = typeof next.slug === 'string' ? next.slug : previous.slug
  const workspaceID = relationID(
    Object.hasOwn(next, 'workspace') ? next.workspace : previous.workspace,
  )
  const previousWorkspaceID = relationID(previous.workspace)

  if (typeof slug !== 'string' || !slug) return data
  if (operation === 'update' && slug === previous.slug && workspaceID === previousWorkspaceID) {
    return data
  }

  const scope = workspaceID ?? 'legacy'
  await acquireTransactionLock(req, 'app-slug', `${scope}:${slug}`)
  const duplicate = await req.payload.count({
    collection: 'apps',
    overrideAccess: true,
    req,
    where: {
      and: [
        { slug: { equals: slug } },
        workspaceID
          ? { workspace: { equals: /^\d+$/.test(workspaceID) ? Number(workspaceID) : workspaceID } }
          : { workspace: { exists: false } },
        ...(previous.id ? [{ id: { not_equals: previous.id } }] : []),
      ],
    },
  })
  if (duplicate.totalDocs > 0) {
    throw new APIError('This app key is already used in the selected workspace.', 409)
  }
  return data
}
