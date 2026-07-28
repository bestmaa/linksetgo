import {
  APIError,
  commitTransaction,
  initTransaction,
  killTransaction,
  type CollectionBeforeValidateHook,
  type Field,
  type PayloadRequest,
} from 'payload'

import { isPlatformSuperAdmin, relationID } from './tenant-context'

export type PlatformSuspendableResource = 'app' | 'domain' | 'link' | 'organization' | 'workspace'

export type PlatformSuspensionAction = 'restore' | 'suspend'

export type PlatformSuspensionResult = {
  changed: boolean
  resourceID: string
  resourceType: PlatformSuspendableResource
  suspended: boolean
}

const authorizedRequests = new WeakSet<PayloadRequest>()
const platformFieldNames = [
  'platformRestoredAt',
  'platformSuspended',
  'platformSuspendedAt',
  'platformSuspensionCase',
  'platformSuspensionReason',
] as const

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const immutableField = (): false => false
const operatorRead = ({ req }: { req: PayloadRequest }): boolean => isPlatformSuperAdmin(req)

export const platformSuspensionFields: Field[] = [
  {
    name: 'platformSuspended',
    type: 'checkbox',
    defaultValue: false,
    index: true,
    access: { update: immutableField },
    admin: {
      description: 'Platform abuse hold. Tenant lifecycle changes cannot clear this control.',
      readOnly: true,
    },
  },
  {
    name: 'platformSuspendedAt',
    type: 'date',
    access: { read: operatorRead, update: immutableField },
    admin: { readOnly: true },
  },
  {
    name: 'platformRestoredAt',
    type: 'date',
    access: { read: operatorRead, update: immutableField },
    admin: { readOnly: true },
  },
  {
    name: 'platformSuspensionReason',
    type: 'textarea',
    maxLength: 1_000,
    access: { read: operatorRead, update: immutableField },
    admin: { readOnly: true },
  },
  {
    name: 'platformSuspensionCase',
    type: 'relationship',
    relationTo: 'abuse-cases',
    index: true,
    access: { read: operatorRead, update: immutableField },
    admin: { readOnly: true },
  },
]

export const enforcePlatformSuspensionFields: CollectionBeforeValidateHook = ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  const next = isRecord(data) ? data : {}
  const previous = isRecord(originalDoc) ? originalDoc : {}
  const changed = platformFieldNames.some((field) => {
    if (!Object.hasOwn(next, field)) return false
    if (field === 'platformSuspended') {
      return (next[field] === true) !== (previous[field] === true)
    }
    if (field === 'platformSuspensionCase') {
      return relationID(next[field]) !== relationID(previous[field])
    }
    return (next[field] ?? null) !== (previous[field] ?? null)
  })

  if (operation === 'create') {
    if (
      next.platformSuspended === true ||
      platformFieldNames
        .filter((field) => field !== 'platformSuspended')
        .some((field) => next[field] !== null && next[field] !== undefined)
    ) {
      throw new APIError('Platform suspension metadata cannot be supplied on creation.', 403)
    }
    return { ...next, platformSuspended: false }
  }

  if (changed && (!authorizedRequests.has(req) || !isPlatformSuperAdmin(req))) {
    throw new APIError('Only the platform enforcement service can change an abuse hold.', 403)
  }

  return data
}

function collectionForResource(
  type: PlatformSuspendableResource,
): 'apps' | 'deep-links' | 'domains' | 'organizations' | 'workspaces' {
  switch (type) {
    case 'app':
      return 'apps'
    case 'domain':
      return 'domains'
    case 'link':
      return 'deep-links'
    case 'organization':
      return 'organizations'
    case 'workspace':
      return 'workspaces'
  }
}

function numericID(value: unknown, label: string): number {
  const raw = relationID(value)
  const id = raw ? Number(raw) : Number.NaN
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new APIError(`${label} is invalid.`, 400)
  }
  return id
}

async function validateCase(req: PayloadRequest, value: number | undefined): Promise<void> {
  if (value === undefined) return
  const abuseCase = await req.payload.findByID({
    collection: 'abuse-cases',
    id: value,
    depth: 0,
    overrideAccess: true,
    req,
  })
  if (abuseCase.status === 'closed') {
    throw new APIError('A closed abuse case cannot receive a new enforcement action.', 409)
  }
}

type SuspensionUpdate = {
  platformRestoredAt?: null | string
  platformSuspended: boolean
  platformSuspendedAt?: null | string
  platformSuspensionCase?: null | number
  platformSuspensionReason?: null | string
}

async function updateResource(input: {
  data: SuspensionUpdate
  id: number
  req: PayloadRequest
  type: PlatformSuspendableResource
}): Promise<void> {
  const options = {
    id: input.id,
    depth: 0,
    overrideAccess: true,
    req: input.req,
    data: input.data,
  } as const

  switch (input.type) {
    case 'app':
      await input.req.payload.update({ collection: 'apps', ...options })
      return
    case 'domain':
      await input.req.payload.update({ collection: 'domains', ...options })
      return
    case 'link':
      await input.req.payload.update({ collection: 'deep-links', ...options })
      return
    case 'organization':
      await input.req.payload.update({ collection: 'organizations', ...options })
      return
    case 'workspace':
      await input.req.payload.update({ collection: 'workspaces', ...options })
  }
}

export async function setPlatformSuspension(input: {
  action: PlatformSuspensionAction
  abuseCaseID?: number | string
  reason: string
  req: PayloadRequest
  resourceID: number | string
  resourceType: PlatformSuspendableResource
}): Promise<PlatformSuspensionResult> {
  if (!isPlatformSuperAdmin(input.req) || !input.req.user?.id) {
    throw new APIError('Platform super-admin access is required.', 403)
  }

  const reason = input.reason.trim()
  if (reason.length < 3 || reason.length > 1_000) {
    throw new APIError('Provide an enforcement reason between 3 and 1000 characters.', 400)
  }
  const abuseCaseID =
    input.abuseCaseID === undefined ? undefined : numericID(input.abuseCaseID, 'Abuse case')
  const requestedResourceID = numericID(input.resourceID, 'Resource')
  const actorID = numericID(input.req.user.id, 'Operator')
  await validateCase(input.req, abuseCaseID)

  const ownsTransaction = input.req.transactionID ? false : await initTransaction(input.req)
  if (!input.req.transactionID) {
    throw new Error('Could not initialize the platform enforcement transaction.')
  }

  const collection = collectionForResource(input.resourceType)
  try {
    const current = await input.req.payload.findByID({
      collection,
      id: requestedResourceID,
      depth: 0,
      overrideAccess: true,
      req: input.req,
    })
    const currentRecord: Record<string, unknown> = isRecord(current) ? current : {}
    const currentlySuspended = currentRecord['platformSuspended'] === true
    const nextSuspended = input.action === 'suspend'
    const resourceID = relationID(currentRecord['id']) ?? String(requestedResourceID)
    if (currentlySuspended === nextSuspended) {
      if (ownsTransaction) await commitTransaction(input.req)
      return {
        changed: false,
        resourceID,
        resourceType: input.resourceType,
        suspended: nextSuspended,
      }
    }

    const occurredAt = new Date().toISOString()
    const event = await input.req.payload.create({
      collection: 'enforcement-events',
      depth: 0,
      overrideAccess: true,
      req: input.req,
      data: {
        action: input.action,
        actor: actorID,
        ...(abuseCaseID ? { abuseCase: abuseCaseID } : {}),
        occurredAt,
        previousSuspended: currentlySuspended,
        reason,
        resourceID,
        resourceType: input.resourceType,
      },
    })

    authorizedRequests.add(input.req)
    try {
      await updateResource({
        id: requestedResourceID,
        req: input.req,
        type: input.resourceType,
        data: nextSuspended
          ? {
              platformRestoredAt: null,
              platformSuspended: true,
              platformSuspendedAt: occurredAt,
              platformSuspensionCase: abuseCaseID ?? null,
              platformSuspensionReason: reason,
            }
          : {
              platformRestoredAt: occurredAt,
              platformSuspended: false,
            },
      })
    } finally {
      authorizedRequests.delete(input.req)
    }

    if (abuseCaseID) {
      await input.req.payload.create({
        collection: 'abuse-case-events',
        depth: 0,
        overrideAccess: true,
        req: input.req,
        data: {
          abuseCase: abuseCaseID,
          actor: actorID,
          enforcementEvent: event.id,
          eventType: nextSuspended ? 'resource-suspended' : 'resource-restored',
          occurredAt,
          summary: `${input.resourceType}:${resourceID} ${
            nextSuspended ? 'suspended' : 'restored'
          }`,
        },
      })
    }

    if (ownsTransaction) await commitTransaction(input.req)
    return {
      changed: true,
      resourceID,
      resourceType: input.resourceType,
      suspended: nextSuspended,
    }
  } catch (error) {
    if (ownsTransaction) await killTransaction(input.req)
    throw error
  }
}
