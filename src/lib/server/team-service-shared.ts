import 'server-only'

import type { Payload, PayloadRequest } from 'payload'

import type { TeamRole } from '@/lib/domain/team-invitations'
import type { User } from '@/payload-types'
import { relationID } from './tenant-context'

export type TeamActor = {
  canInviteOwner: boolean
  canManage: boolean
  organizationName: string
  role: 'platform-admin' | TeamRole
}

export const teamRelationInput = (id: string): number | string =>
  /^\d+$/.test(id) ? Number(id) : id

export const isActiveTeamUser = (value: unknown): value is User =>
  typeof value === 'object' &&
  value !== null &&
  'id' in value &&
  (typeof value.id === 'number' || typeof value.id === 'string') &&
  'status' in value &&
  value.status === 'active'

export async function resolveTeamActor(input: {
  organizationID: string
  payload: Payload
  req?: PayloadRequest
  user: User
}): Promise<TeamActor | null> {
  const organization = await input.payload
    .findByID({
      collection: 'organizations',
      id: teamRelationInput(input.organizationID),
      depth: 0,
      overrideAccess: true,
      ...(input.req ? { req: input.req } : {}),
    })
    .catch(() => null)
  if (!organization || organization.status !== 'active') return null

  if (input.user.role === 'super-admin') {
    return {
      canInviteOwner: true,
      canManage: true,
      organizationName: organization.name,
      role: 'platform-admin',
    }
  }

  const memberships = await input.payload.find({
    collection: 'organization-memberships',
    depth: 0,
    limit: 2,
    overrideAccess: true,
    pagination: false,
    ...(input.req ? { req: input.req } : {}),
    where: {
      and: [
        { organization: { equals: teamRelationInput(input.organizationID) } },
        { user: { equals: input.user.id } },
        { status: { equals: 'active' } },
      ],
    },
  })
  const membership = memberships.docs.length === 1 ? memberships.docs[0] : null
  const organizationID = relationID(membership?.organization)
  const role = membership?.role
  if (
    organizationID !== input.organizationID ||
    (role !== 'owner' && role !== 'admin' && role !== 'member' && role !== 'viewer')
  ) {
    return null
  }
  return {
    canInviteOwner: role === 'owner',
    canManage: role === 'owner' || role === 'admin',
    organizationName: organization.name,
    role,
  }
}
