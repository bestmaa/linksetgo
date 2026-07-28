import { APIError, type CollectionBeforeValidateHook } from 'payload'

import { relationID } from './tenant-context'

export const DEEP_LINK_IDENTITY_MIGRATION_CONTEXT_KEY = 'relayAllowDeepLinkIdentityMigration'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const selected = (
  data: Record<string, unknown>,
  original: Record<string, unknown>,
  field: string,
): unknown => (Object.hasOwn(data, field) ? data[field] : original[field])

const relationshipInput = (id: string): number | string => (/^\d+$/.test(id) ? Number(id) : id)

export const enforceDeepLinkLifecycle: CollectionBeforeValidateHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  const next = isRecord(data) ? data : {}
  const previous = isRecord(originalDoc) ? originalDoc : {}
  const appID = relationID(selected(next, previous, 'app'))
  const slug = selected(next, previous, 'slug')

  if (operation === 'update') {
    const identityChanged =
      appID !== relationID(previous.app) ||
      (typeof slug === 'string' && typeof previous.slug === 'string' && slug !== previous.slug)
    const isInternalMigration =
      !req.user && req.context[DEEP_LINK_IDENTITY_MIGRATION_CONTEXT_KEY] === true
    if (identityChanged && !isInternalMigration) {
      throw new APIError('A link cannot be moved to another app or assigned a new key.', 400)
    }
  }

  const nextStatus = selected(next, previous, 'status')
  const isActivation =
    nextStatus === 'active' && (operation === 'create' || previous.status !== 'active')
  if (!isActivation) return data
  if (!appID) throw new APIError('An active link requires an app.', 400)

  const app = await req.payload.findByID({
    collection: 'apps',
    id: relationshipInput(appID),
    depth: 0,
    overrideAccess: true,
    req,
  })
  if (app.status !== 'active' || app.platformSuspended) {
    throw new APIError('Activate the app before activating this link.', 400)
  }
  return data
}
