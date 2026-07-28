import {
  APIError,
  type CollectionBeforeDeleteHook,
  type CollectionBeforeValidateHook,
} from 'payload'

import { acquireTransactionLock } from './postgres-lock'
import { relationID } from './tenant-context'

export const MEMBERSHIP_OWNER_OVERRIDE_CONTEXT = 'relayMembershipOwnerOverride'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const selected = (
  next: Record<string, unknown>,
  previous: Record<string, unknown>,
  field: string,
): unknown => (Object.hasOwn(next, field) ? next[field] : previous[field])

const isManagingRole = (role: unknown): boolean => role === 'owner' || role === 'admin'

async function requireAnotherOwner(input: {
  membershipID: number | string
  organizationID: string
  req: Parameters<CollectionBeforeDeleteHook>[0]['req']
}): Promise<void> {
  await acquireTransactionLock(input.req, 'organization-owners', input.organizationID)
  const owners = await input.req.payload.count({
    collection: 'organization-memberships',
    overrideAccess: true,
    req: input.req,
    where: {
      and: [
        { organization: { equals: input.organizationID } },
        { role: { equals: 'owner' } },
        { status: { equals: 'active' } },
        { id: { not_equals: input.membershipID } },
      ],
    },
  })
  if (owners.totalDocs === 0) {
    throw new APIError('Every organization must keep at least one active owner.', 409)
  }
}

export const protectOrganizationMembershipUpdate: CollectionBeforeValidateHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (operation !== 'update' || req.context[MEMBERSHIP_OWNER_OVERRIDE_CONTEXT] === true) {
    return data
  }

  const next = isRecord(data) ? data : {}
  const previous = isRecord(originalDoc) ? originalDoc : {}
  const previousRole = previous.role
  const previousStatus = previous.status
  const nextRole = selected(next, previous, 'role')
  const nextStatus = selected(next, previous, 'status')
  const actorID = relationID(req.user?.id)
  const subjectID = relationID(previous.user)
  const losesManagement =
    previousStatus === 'active' &&
    isManagingRole(previousRole) &&
    (nextStatus !== 'active' || !isManagingRole(nextRole))

  if (actorID && subjectID === actorID && losesManagement) {
    throw new APIError('You cannot remove your own organization management access.', 409)
  }

  if (
    previousRole === 'owner' &&
    previousStatus === 'active' &&
    (nextRole !== 'owner' || nextStatus !== 'active')
  ) {
    const organizationID = relationID(previous.organization)
    if (!organizationID || previous.id === undefined) {
      throw new APIError('Owner membership state is incomplete.', 409)
    }
    await requireAnotherOwner({
      membershipID: previous.id as number | string,
      organizationID,
      req,
    })
  }
  return data
}

export const protectOrganizationMembershipDelete: CollectionBeforeDeleteHook = async ({
  id,
  req,
}) => {
  if (req.context[MEMBERSHIP_OWNER_OVERRIDE_CONTEXT] === true) return

  const membership = await req.payload.findByID({
    collection: 'organization-memberships',
    id,
    depth: 0,
    overrideAccess: true,
    req,
  })
  const actorID = relationID(req.user?.id)
  const subjectID = relationID(membership.user)
  if (
    actorID &&
    subjectID === actorID &&
    membership.status === 'active' &&
    isManagingRole(membership.role)
  ) {
    throw new APIError('You cannot remove your own organization management access.', 409)
  }

  if (membership.role === 'owner' && membership.status === 'active') {
    const organizationID = relationID(membership.organization)
    if (!organizationID) throw new APIError('Owner membership state is incomplete.', 409)
    await requireAnotherOwner({ membershipID: id, organizationID, req })
  }
}
