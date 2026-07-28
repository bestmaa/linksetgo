import 'server-only'

import {
  APIError,
  commitTransaction,
  createLocalReq,
  initTransaction,
  killTransaction,
  type Payload,
} from 'payload'

import type { TeamMemberMutationInput } from '@/lib/domain/team-invitations'
import type {
  TeamConsoleDTO,
  TeamInvitationConsoleDTO,
  TeamMemberConsoleDTO,
} from '@/lib/client/payload-types'
import type { OrganizationInvitation, OrganizationMembership, User } from '@/payload-types'
import { relationID } from './tenant-context'
import { resolveTeamActor, teamRelationInput } from './team-service-shared'

export type TeamConsoleResult<T> =
  | { ok: true; value: T }
  | {
      code: 'FORBIDDEN' | 'INVALID_CHANGE' | 'NOT_FOUND' | 'PLAN_LIMIT' | 'UNAVAILABLE'
      message: string
      ok: false
      status: number
    }

const relatedUser = (value: OrganizationMembership['user']): User | null =>
  typeof value === 'object' && value ? value : null

const relatedInviter = (value: OrganizationInvitation['invitedBy']): User | null =>
  typeof value === 'object' && value ? value : null

function projectMember(membership: OrganizationMembership, actorID: string): TeamMemberConsoleDTO {
  const user = relatedUser(membership.user)
  const userID = relationID(membership.user) ?? ''
  return {
    email: user?.email ?? 'Profile details are private',
    id: membership.id,
    isSelf: userID === actorID,
    name: user?.name?.trim() || user?.email || `Member ${userID}`,
    role: membership.role,
    status: membership.status,
    userId: user?.id ?? userID,
    ...(membership.updatedAt ? { updatedAt: membership.updatedAt } : {}),
  }
}

function invitationStatus(
  invitation: OrganizationInvitation,
  now: Date,
): TeamInvitationConsoleDTO['status'] {
  return invitation.status === 'pending' &&
    new Date(invitation.expiresAt).getTime() <= now.getTime()
    ? 'expired'
    : invitation.status
}

export function projectTeamInvitation(
  invitation: OrganizationInvitation,
  now: Date = new Date(),
): TeamInvitationConsoleDTO {
  const inviter = relatedInviter(invitation.invitedBy)
  return {
    deliveryMode: invitation.deliveryMode,
    email: invitation.emailNormalized,
    expiresAt: invitation.expiresAt,
    id: invitation.id,
    invitedByName: inviter?.name?.trim() || inviter?.email || 'LinksetGo administrator',
    role: invitation.role,
    status: invitationStatus(invitation, now),
  }
}

export async function getTeamConsole(
  payload: Payload,
  user: User,
  organizationID: string,
): Promise<TeamConsoleResult<TeamConsoleDTO>> {
  try {
    const actor = await resolveTeamActor({ organizationID, payload, user })
    if (!actor) {
      return {
        code: 'NOT_FOUND',
        message: 'This team is not available in the selected organization.',
        ok: false,
        status: 404,
      }
    }

    const [memberships, invitations] = await Promise.all([
      payload.find({
        collection: 'organization-memberships',
        depth: 1,
        limit: 500,
        overrideAccess: true,
        pagination: false,
        sort: 'createdAt',
        where: { organization: { equals: teamRelationInput(organizationID) } },
      }),
      actor.canManage
        ? payload.find({
            collection: 'organization-invitations',
            depth: 1,
            limit: 100,
            overrideAccess: true,
            pagination: false,
            sort: '-createdAt',
            where: { organization: { equals: teamRelationInput(organizationID) } },
          })
        : Promise.resolve({ docs: [] }),
    ])
    return {
      ok: true,
      value: {
        canInviteOwner: actor.canInviteOwner,
        canManage: actor.canManage,
        canManualInvite: user.role === 'super-admin',
        invitations: invitations.docs.map((invitation) =>
          projectTeamInvitation(invitation as OrganizationInvitation),
        ),
        members: memberships.docs.map((membership) => projectMember(membership, String(user.id))),
        organizationId: teamRelationInput(organizationID),
        organizationName: actor.organizationName,
      },
    }
  } catch {
    return {
      code: 'UNAVAILABLE',
      message: 'Team access is temporarily unavailable.',
      ok: false,
      status: 500,
    }
  }
}

const apiErrorResult = (error: APIError): TeamConsoleResult<never> => {
  const status = error.status ?? 409
  return {
    code: status === 402 ? 'PLAN_LIMIT' : 'INVALID_CHANGE',
    message:
      status === 402
        ? 'This organization has reached its member limit.'
        : error.message || 'This member change is not allowed.',
    ok: false,
    status,
  }
}

export async function mutateTeamMember(input: {
  membershipID: string
  mutation: TeamMemberMutationInput
  payload: Payload
  user: User
}): Promise<TeamConsoleResult<TeamConsoleDTO>> {
  const req = await createLocalReq({ user: input.user }, input.payload)
  const ownsTransaction = await initTransaction(req)
  if (!ownsTransaction) {
    return {
      code: 'UNAVAILABLE',
      message: 'LinksetGo could not start an atomic team update.',
      ok: false,
      status: 503,
    }
  }

  try {
    const actor = await resolveTeamActor({
      organizationID: input.mutation.organizationId,
      payload: input.payload,
      req,
      user: input.user,
    })
    if (!actor?.canManage) {
      await killTransaction(req)
      return {
        code: 'NOT_FOUND',
        message: 'This member is not available in the selected organization.',
        ok: false,
        status: 404,
      }
    }

    const targets = await input.payload.find({
      collection: 'organization-memberships',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      req,
      where: {
        and: [
          { id: { equals: teamRelationInput(input.membershipID) } },
          {
            organization: {
              equals: teamRelationInput(input.mutation.organizationId),
            },
          },
        ],
      },
    })
    const target = targets.docs[0]
    if (!target) {
      await killTransaction(req)
      return {
        code: 'NOT_FOUND',
        message: 'This member is not available in the selected organization.',
        ok: false,
        status: 404,
      }
    }
    if (
      !actor.canInviteOwner &&
      (target.role === 'owner' ||
        (input.mutation.action === 'update' && input.mutation.role === 'owner'))
    ) {
      throw new APIError('Only an organization owner can manage owner access.', 403)
    }
    if (input.mutation.action === 'remove') {
      await input.payload.delete({
        collection: 'organization-memberships',
        id: target.id,
        overrideAccess: true,
        req,
        user: input.user,
      })
    } else {
      await input.payload.update({
        collection: 'organization-memberships',
        id: target.id,
        data: { role: input.mutation.role, status: input.mutation.status },
        depth: 0,
        overrideAccess: false,
        req,
        user: input.user,
      })
    }
    await commitTransaction(req)
    return getTeamConsole(input.payload, input.user, input.mutation.organizationId)
  } catch (error) {
    await killTransaction(req)
    return error instanceof APIError
      ? apiErrorResult(error)
      : {
          code: 'UNAVAILABLE',
          message: 'LinksetGo could not update this team member.',
          ok: false,
          status: 500,
        }
  }
}
