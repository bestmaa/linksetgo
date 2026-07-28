import 'server-only'

import { createHash, randomBytes } from 'node:crypto'

import {
  APIError,
  commitTransaction,
  createLocalReq,
  initTransaction,
  killTransaction,
  type Payload,
} from 'payload'

import { canCreateResource } from '@/lib/domain/plan-catalog'
import {
  TEAM_INVITATION_TTL_MS,
  type AcceptTeamInvitationInput,
  type CreateTeamInvitationInput,
  maskTeamEmail,
  normalizeTeamEmail,
} from '@/lib/domain/team-invitations'
import { isCloudVerificationToken } from '@/lib/domain/cloud-verification-token'
import type {
  TeamInvitationAcceptDTO,
  TeamInvitationCreateDTO,
  TeamInvitationPreviewDTO,
} from '@/lib/client/payload-types'
import type { OrganizationInvitation, User } from '@/payload-types'
import { resolveOrganizationPlan } from './billing-plan'
import { getRelayEdition } from './deployment-edition'
import { acquireTransactionLock } from './postgres-lock'
import { projectTeamInvitation } from './team-console'
import type { TeamInvitationSender } from './team-invitation-delivery'
import { TEAM_INVITATION_WRITE_CONTEXT } from './team-invitation-guards'
import { resolveTeamActor, teamRelationInput } from './team-service-shared'
import { relationID } from './tenant-context'
import { TEAM_INVITATION_USER_CONTEXT_KEY } from './user-creation-policy'

export type TeamInvitationErrorCode =
  | 'ATOMIC_OPERATION_UNAVAILABLE'
  | 'AUTHENTICATION_REQUIRED'
  | 'DELIVERY_FAILED'
  | 'DELIVERY_UNAVAILABLE'
  | 'FORBIDDEN'
  | 'INVITATION_INVALID'
  | 'INVITATION_UNAVAILABLE'
  | 'PLAN_LIMIT'

export class TeamInvitationError extends Error {
  constructor(
    readonly code: TeamInvitationErrorCode,
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'TeamInvitationError'
  }
}

type Clock = () => Date

type CreateInvitationOptions = {
  appBaseURL: string
  now?: Clock
  payload: Payload
  randomToken?: () => string
  sendInvitation?: TeamInvitationSender
  user: User
}

type AcceptInvitationOptions = {
  authenticatedUser: User | null
  now?: Clock
  payload: Payload
}

const safeToken = (): string => randomBytes(32).toString('base64url')

export function hashTeamInvitationToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

const invalidInvitation = (): TeamInvitationError =>
  new TeamInvitationError(
    'INVITATION_INVALID',
    'This invitation link is invalid or no longer available.',
    404,
  )

const unavailableInvitation = (): TeamInvitationError =>
  new TeamInvitationError(
    'INVITATION_UNAVAILABLE',
    'This invitation cannot be created for that address.',
    409,
  )

const beginAtomicRequest = async (
  payload: Payload,
  input: { authenticatedUser?: User; includeUserCreation?: boolean } = {},
) => {
  const req = await createLocalReq(
    {
      ...(input.authenticatedUser ? { user: input.authenticatedUser } : {}),
      context: {
        [TEAM_INVITATION_WRITE_CONTEXT]: true,
        ...(input.includeUserCreation ? { [TEAM_INVITATION_USER_CONTEXT_KEY]: true } : {}),
      },
    },
    payload,
  )
  if (!(await initTransaction(req))) {
    throw new TeamInvitationError(
      'ATOMIC_OPERATION_UNAVAILABLE',
      'Relay could not start an atomic team operation.',
      503,
    )
  }
  return req
}

const findExistingUser = async (
  payload: Payload,
  email: string,
  req?: Awaited<ReturnType<typeof createLocalReq>>,
): Promise<User | null> => {
  const users = await payload.find({
    collection: 'users',
    depth: 0,
    limit: 2,
    overrideAccess: true,
    pagination: false,
    ...(req ? { req } : {}),
    where: { email: { equals: email } },
  })
  return users.docs.length === 1 ? (users.docs[0] ?? null) : null
}

async function enforceInvitationMemberQuota(input: {
  now: Date
  organizationID: string
  payload: Payload
  req: Awaited<ReturnType<typeof createLocalReq>>
}): Promise<void> {
  if (getRelayEdition() === 'community') return

  await acquireTransactionLock(input.req, 'organization-quota', `${input.organizationID}:members`)
  const resolution = await resolveOrganizationPlan(
    input.payload,
    teamRelationInput(input.organizationID),
    { edition: 'cloud', now: input.now, req: input.req },
  )
  if (!resolution.access.canCreate) {
    throw new TeamInvitationError(
      'PLAN_LIMIT',
      'This subscription currently blocks new members.',
      402,
    )
  }

  const [members, pendingInvitations] = await Promise.all([
    input.payload.count({
      collection: 'organization-memberships',
      overrideAccess: true,
      req: input.req,
      where: {
        and: [
          {
            organization: {
              equals: teamRelationInput(input.organizationID),
            },
          },
          { status: { equals: 'active' } },
        ],
      },
    }),
    input.payload.count({
      collection: 'organization-invitations',
      overrideAccess: true,
      req: input.req,
      where: {
        and: [
          {
            organization: {
              equals: teamRelationInput(input.organizationID),
            },
          },
          { status: { equals: 'pending' } },
          { expiresAt: { greater_than: input.now.toISOString() } },
        ],
      },
    }),
  ])
  const reservedMembers = members.totalDocs + pendingInvitations.totalDocs
  if (!canCreateResource(resolution.plan, 'members', reservedMembers)) {
    throw new TeamInvitationError(
      'PLAN_LIMIT',
      `${resolution.plan.name} has reached its member limit.`,
      402,
    )
  }
}

async function ensureInviteAddressAvailable(input: {
  email: string
  now: Date
  organizationID: string
  payload: Payload
  req: Awaited<ReturnType<typeof createLocalReq>>
}): Promise<void> {
  await acquireTransactionLock(
    input.req,
    'organization-invitation-email',
    `${input.organizationID}:${input.email}`,
  )
  const existingUser = await findExistingUser(input.payload, input.email, input.req)
  if (existingUser) {
    const memberships = await input.payload.count({
      collection: 'organization-memberships',
      overrideAccess: true,
      req: input.req,
      where: {
        and: [
          {
            organization: {
              equals: teamRelationInput(input.organizationID),
            },
          },
          { user: { equals: existingUser.id } },
          { status: { equals: 'active' } },
        ],
      },
    })
    if (memberships.totalDocs > 0) throw unavailableInvitation()
  }

  const pending = await input.payload.count({
    collection: 'organization-invitations',
    overrideAccess: true,
    req: input.req,
    where: {
      and: [
        {
          organization: {
            equals: teamRelationInput(input.organizationID),
          },
        },
        { emailNormalized: { equals: input.email } },
        { status: { equals: 'pending' } },
        { expiresAt: { greater_than: input.now.toISOString() } },
      ],
    },
  })
  if (pending.totalDocs > 0) throw unavailableInvitation()
}

export async function createOrganizationInvitation(
  invitationInput: CreateTeamInvitationInput,
  options: CreateInvitationOptions,
): Promise<TeamInvitationCreateDTO> {
  const now = (options.now ?? (() => new Date()))()
  const token = (options.randomToken ?? safeToken)()
  if (!isCloudVerificationToken(token)) {
    throw new TeamInvitationError(
      'DELIVERY_FAILED',
      'A secure invitation link could not be created.',
      503,
    )
  }

  const req = await beginAtomicRequest(options.payload, {
    authenticatedUser: options.user,
  })
  try {
    const actor = await resolveTeamActor({
      organizationID: invitationInput.organizationId,
      payload: options.payload,
      req,
      user: options.user,
    })
    if (!actor?.canManage) {
      throw new TeamInvitationError(
        'FORBIDDEN',
        'You cannot invite members to this organization.',
        403,
      )
    }
    if (invitationInput.role === 'owner' && !actor.canInviteOwner) {
      throw new TeamInvitationError(
        'FORBIDDEN',
        'Only an organization owner can invite another owner.',
        403,
      )
    }
    if (invitationInput.delivery === 'manual' && options.user.role !== 'super-admin') {
      throw new TeamInvitationError(
        'FORBIDDEN',
        'Manual invitation delivery is reserved for platform administrators.',
        403,
      )
    }
    if (invitationInput.delivery === 'webhook' && !options.sendInvitation) {
      throw new TeamInvitationError(
        'DELIVERY_UNAVAILABLE',
        'Invitation email delivery is unavailable.',
        503,
      )
    }

    await ensureInviteAddressAvailable({
      email: invitationInput.email,
      now,
      organizationID: invitationInput.organizationId,
      payload: options.payload,
      req,
    })
    await enforceInvitationMemberQuota({
      now,
      organizationID: invitationInput.organizationId,
      payload: options.payload,
      req,
    })

    const expiresAt = new Date(now.getTime() + TEAM_INVITATION_TTL_MS).toISOString()
    const invitation = await options.payload.create({
      collection: 'organization-invitations',
      data: {
        deliveryMode: invitationInput.delivery,
        emailNormalized: invitationInput.email,
        expiresAt,
        invitedBy: options.user.id,
        organization: Number(invitationInput.organizationId),
        role: invitationInput.role,
        status: 'pending',
        tokenHash: hashTeamInvitationToken(token),
      },
      depth: 1,
      overrideAccess: true,
      req,
      showHiddenFields: true,
    })
    const invitationURL = new URL('/invite', options.appBaseURL)
    invitationURL.hash = new URLSearchParams({ token }).toString()

    if (invitationInput.delivery === 'webhook') {
      try {
        await options.sendInvitation?.({
          email: invitationInput.email,
          expiresAt,
          invitationURL: invitationURL.toString(),
          inviterName: options.user.name?.trim() || options.user.email,
          organizationName: actor.organizationName,
          role: invitationInput.role,
        })
      } catch {
        throw new TeamInvitationError(
          'DELIVERY_FAILED',
          'The invitation email could not be queued.',
          503,
        )
      }
      await options.payload.update({
        collection: 'organization-invitations',
        id: invitation.id,
        data: { deliveredAt: now.toISOString() },
        depth: 0,
        overrideAccess: true,
        req,
      })
    }

    await commitTransaction(req)
    return {
      invitation: projectTeamInvitation(invitation as OrganizationInvitation, now),
      ...(invitationInput.delivery === 'manual' ? { manualUrl: invitationURL.toString() } : {}),
    }
  } catch (error) {
    await killTransaction(req)
    if (error instanceof TeamInvitationError) throw error
    if (error instanceof APIError && error.status === 402) {
      throw new TeamInvitationError('PLAN_LIMIT', error.message, 402)
    }
    throw new TeamInvitationError(
      'INVITATION_UNAVAILABLE',
      'Relay could not create this invitation.',
      503,
    )
  }
}

export async function revokeOrganizationInvitation(input: {
  invitationID: string
  organizationID: string
  payload: Payload
  user: User
}): Promise<void> {
  const req = await beginAtomicRequest(input.payload, {
    authenticatedUser: input.user,
  })
  try {
    const actor = await resolveTeamActor({
      organizationID: input.organizationID,
      payload: input.payload,
      req,
      user: input.user,
    })
    if (!actor?.canManage) {
      throw new TeamInvitationError(
        'FORBIDDEN',
        'You cannot revoke invitations in this organization.',
        403,
      )
    }
    const invitations = await input.payload.find({
      collection: 'organization-invitations',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      req,
      where: {
        and: [
          { id: { equals: teamRelationInput(input.invitationID) } },
          {
            organization: {
              equals: teamRelationInput(input.organizationID),
            },
          },
          { status: { equals: 'pending' } },
        ],
      },
    })
    const invitation = invitations.docs[0]
    if (!invitation) throw invalidInvitation()
    if (invitation.role === 'owner' && !actor.canInviteOwner) {
      throw new TeamInvitationError(
        'FORBIDDEN',
        'Only an organization owner can revoke an owner invitation.',
        403,
      )
    }
    await input.payload.update({
      collection: 'organization-invitations',
      id: invitation.id,
      data: { revokedAt: new Date().toISOString(), status: 'revoked' },
      depth: 0,
      overrideAccess: true,
      req,
    })
    await commitTransaction(req)
  } catch (error) {
    await killTransaction(req)
    if (error instanceof TeamInvitationError) throw error
    throw new TeamInvitationError(
      'INVITATION_UNAVAILABLE',
      'Relay could not revoke this invitation.',
      503,
    )
  }
}

async function resolveInvitationByToken(input: {
  now: Date
  payload: Payload
  req?: Awaited<ReturnType<typeof createLocalReq>>
  token: string
}): Promise<OrganizationInvitation> {
  const invitations = await input.payload.find({
    collection: 'organization-invitations',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    ...(input.req ? { req: input.req } : {}),
    showHiddenFields: true,
    where: {
      and: [
        { tokenHash: { equals: hashTeamInvitationToken(input.token) } },
        { status: { equals: 'pending' } },
      ],
    },
  })
  const invitation = invitations.docs[0]
  if (!invitation || new Date(invitation.expiresAt).getTime() <= input.now.getTime()) {
    throw invalidInvitation()
  }
  return invitation
}

export async function previewOrganizationInvitation(input: {
  authenticatedUser: User | null
  now?: Clock
  payload: Payload
  token: string
}): Promise<TeamInvitationPreviewDTO> {
  const now = (input.now ?? (() => new Date()))()
  const invitation = await resolveInvitationByToken({
    now,
    payload: input.payload,
    token: input.token,
  })
  const organizationID = relationID(invitation.organization)
  if (!organizationID) throw invalidInvitation()
  const organization = await input.payload
    .findByID({
      collection: 'organizations',
      id: teamRelationInput(organizationID),
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null)
  if (!organization || organization.status !== 'active') throw invalidInvitation()

  const authenticatedEmail = normalizeTeamEmail(input.authenticatedUser?.email)
  let accountMode: TeamInvitationPreviewDTO['accountMode']
  if (input.authenticatedUser) {
    accountMode =
      input.authenticatedUser.status === 'active' &&
      authenticatedEmail === invitation.emailNormalized
        ? 'accept'
        : 'wrong-account'
  } else {
    const user = await findExistingUser(input.payload, invitation.emailNormalized)
    accountMode = user
      ? user.status === 'active'
        ? 'sign-in'
        : 'unavailable'
      : getRelayEdition() === 'cloud'
        ? 'create'
        : 'unavailable'
  }

  return {
    accountMode,
    emailMasked: maskTeamEmail(invitation.emailNormalized),
    organizationName: organization.name,
    role: invitation.role,
  }
}

export async function acceptOrganizationInvitation(
  invitationInput: AcceptTeamInvitationInput,
  options: AcceptInvitationOptions,
): Promise<TeamInvitationAcceptDTO> {
  const now = (options.now ?? (() => new Date()))()
  const req = await beginAtomicRequest(options.payload, {
    ...(options.authenticatedUser ? { authenticatedUser: options.authenticatedUser } : {}),
    includeUserCreation: true,
  })
  try {
    const invitationHash = hashTeamInvitationToken(invitationInput.token)
    await acquireTransactionLock(req, 'organization-invitation-token', invitationHash)
    const invitation = await resolveInvitationByToken({
      now,
      payload: options.payload,
      req,
      token: invitationInput.token,
    })
    const invitedOrganizationID = relationID(invitation.organization)
    if (!invitedOrganizationID) throw invalidInvitation()
    const organization = await options.payload
      .findByID({
        collection: 'organizations',
        id: teamRelationInput(invitedOrganizationID),
        depth: 0,
        overrideAccess: true,
        req,
      })
      .catch(() => null)
    if (!organization || organization.status !== 'active') throw invalidInvitation()

    await acquireTransactionLock(req, 'team-user-email', invitation.emailNormalized)
    let member = await findExistingUser(options.payload, invitation.emailNormalized, req)
    if (options.authenticatedUser) {
      if (
        options.authenticatedUser.status !== 'active' ||
        normalizeTeamEmail(options.authenticatedUser.email) !== invitation.emailNormalized ||
        !member ||
        String(member.id) !== String(options.authenticatedUser.id)
      ) {
        throw new TeamInvitationError(
          'FORBIDDEN',
          'Sign in with the account that received this invitation.',
          403,
        )
      }
      if (invitationInput.name !== null || invitationInput.password !== null) {
        throw new TeamInvitationError(
          'INVITATION_INVALID',
          'Account details are not accepted for a signed-in invitation.',
          400,
        )
      }
    } else if (member) {
      throw new TeamInvitationError(
        'AUTHENTICATION_REQUIRED',
        'Sign in with the account that received this invitation.',
        401,
      )
    } else {
      if (getRelayEdition() !== 'cloud' || !invitationInput.name || !invitationInput.password) {
        throw new TeamInvitationError(
          'AUTHENTICATION_REQUIRED',
          'Sign in with the account that received this invitation.',
          401,
        )
      }
      member = await options.payload.create({
        collection: 'users',
        context: { [TEAM_INVITATION_USER_CONTEXT_KEY]: true },
        data: {
          email: invitation.emailNormalized,
          name: invitationInput.name,
          password: invitationInput.password,
          role: 'viewer',
          status: 'active',
        },
        depth: 0,
        overrideAccess: true,
        req,
      })
    }

    const organizationID = String(organization.id)
    const memberships = await options.payload.find({
      collection: 'organization-memberships',
      depth: 0,
      limit: 2,
      overrideAccess: true,
      pagination: false,
      req,
      where: {
        and: [
          {
            organization: {
              equals: teamRelationInput(organizationID),
            },
          },
          { user: { equals: member.id } },
        ],
      },
    })
    if (memberships.docs.length > 1) throw invalidInvitation()
    const membership = memberships.docs[0]
    if (membership?.status === 'active') throw invalidInvitation()
    if (membership) {
      await options.payload.update({
        collection: 'organization-memberships',
        id: membership.id,
        data: { role: invitation.role, status: 'active' },
        depth: 0,
        overrideAccess: true,
        req,
      })
    } else {
      await options.payload.create({
        collection: 'organization-memberships',
        data: {
          organization: organization.id,
          role: invitation.role,
          status: 'active',
          user: member.id,
        },
        depth: 0,
        overrideAccess: true,
        req,
      })
    }

    const claimed = await options.payload.update({
      collection: 'organization-invitations',
      data: {
        acceptedAt: now.toISOString(),
        acceptedBy: member.id,
        status: 'accepted',
      },
      depth: 0,
      overrideAccess: true,
      req,
      showHiddenFields: true,
      where: {
        and: [
          { id: { equals: invitation.id } },
          { tokenHash: { equals: invitationHash } },
          { status: { equals: 'pending' } },
        ],
      },
    })
    if (claimed.docs.length !== 1) throw invalidInvitation()

    await commitTransaction(req)
    return {
      organizationName: organization.name,
      signInRequired: options.authenticatedUser === null,
      status: 'accepted',
    }
  } catch (error) {
    await killTransaction(req)
    if (error instanceof TeamInvitationError) throw error
    if (error instanceof APIError && error.status === 402) {
      throw new TeamInvitationError('PLAN_LIMIT', error.message, 402)
    }
    throw new TeamInvitationError(
      'INVITATION_INVALID',
      'This invitation could not be accepted.',
      503,
    )
  }
}
