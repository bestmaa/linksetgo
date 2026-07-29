import 'server-only'

import { createHash, randomBytes } from 'node:crypto'

import {
  commitTransaction,
  createLocalReq,
  initTransaction,
  killTransaction,
  type Payload,
  type PayloadRequest,
} from 'payload'

import {
  CLOUD_PENDING_SIGNUP_MAX_LIFETIME_MS,
  CLOUD_VERIFICATION_TOKEN_TTL_MS,
  CLOUD_PENDING_SIGNUP_RECLAIM_GRACE_MS,
  type CloudSignupInput,
  evaluateCloudSignupGate,
} from '@/lib/domain/cloud-signup'
import { isCloudVerificationToken } from '@/lib/domain/cloud-verification-token'
import { buildManagedWorkspaceHostname } from '@/lib/domain/workspace-domain'
import type { User } from '@/payload-types'
import { relationID } from './tenant-context'
import { CLOUD_SIGNUP_CONTEXT_KEY } from './user-creation-policy'
import { MANAGED_DOMAIN_PROVISIONING_CONTEXT_KEY } from './managed-domain-provisioning'
import { ensureFreeSubscriptionForOrganization } from './subscription-bootstrap'
import { MEMBERSHIP_OWNER_OVERRIDE_CONTEXT } from './membership-owner-guards'
import { acquireTransactionLock } from './postgres-lock'

export type CloudSignupErrorCode =
  | 'ATOMIC_SIGNUP_UNAVAILABLE'
  | 'EMAIL_UNAVAILABLE'
  | 'SETUP_REQUIRED'
  | 'SIGNUP_FAILED'
  | 'SIGNUP_UNAVAILABLE'
  | 'VERIFICATION_DELIVERY_FAILED'
  | 'VERIFICATION_FAILED'
  | 'VERIFICATION_INVALID'
  | 'WORKSPACE_UNAVAILABLE'

export class CloudSignupError extends Error {
  constructor(
    readonly code: CloudSignupErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'CloudSignupError'
  }
}

export type VerificationDelivery = {
  email: string
  expiresAt: string
  name: string
  verificationURL: string
}

export type VerificationSender = (delivery: VerificationDelivery) => Promise<void>

type CloudSignupServiceOptions = {
  appBaseURL: string
  managedLinkRootDomain: string
  now?: () => Date
  payload: Payload
  randomToken?: () => string
  sendVerification: VerificationSender
}

type CloudVerificationResendOptions = {
  appBaseURL: string
  now?: () => Date
  payload: Payload
  randomToken?: () => string
  sendVerification: VerificationSender
}

export type CloudSignupResult = {
  email: string
  expiresAt: string
  managedHostname: string
  organizationID: string
  userID: string
  workspaceID: string
}

export type CloudEmailVerificationResult = {
  email: string
  workspaceSlug: string
}

export type PendingSignupPruneResult = {
  pruned: number
  scanned: number
  skipped: number
}

const numericID = (id: string): number | string => (/^\d+$/.test(id) ? Number(id) : id)

export function hashCloudVerificationToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

const safeToken = (): string => randomBytes(32).toString('base64url')

const requireSingleRelation = (value: unknown): string => {
  const id = relationID(value)
  if (!id) {
    throw new CloudSignupError('VERIFICATION_INVALID', 'Verification state is incomplete.')
  }
  return id
}

async function canReclaimPendingSignup(input: {
  managedLinkRootDomain: string
  now: Date
  payload: Payload
  req: PayloadRequest
  user: User
}): Promise<
  | {
      domainID: number
      membershipID: number
      organizationID: number
      userID: number
      workspaceID: number
    }
  | false
> {
  if (
    input.user.status !== 'pending-verification' ||
    !input.user.emailVerificationExpiresAt ||
    Date.parse(input.user.emailVerificationExpiresAt) >
      input.now.getTime() - CLOUD_PENDING_SIGNUP_RECLAIM_GRACE_MS
  ) {
    return false
  }

  const memberships = await input.payload.find({
    collection: 'organization-memberships',
    depth: 0,
    limit: 2,
    overrideAccess: true,
    pagination: false,
    req: input.req,
    where: {
      and: [
        { user: { equals: input.user.id } },
        { role: { equals: 'owner' } },
        { status: { equals: 'disabled' } },
      ],
    },
  })
  const membership = memberships.docs.length === 1 ? memberships.docs[0] : null
  const organizationIDValue = relationID(membership?.organization)
  if (!membership || !organizationIDValue || !/^\d+$/.test(organizationIDValue)) return false
  const organizationID = Number(organizationIDValue)

  const organization = await input.payload.findByID({
    collection: 'organizations',
    id: organizationID,
    depth: 0,
    overrideAccess: true,
    req: input.req,
  })
  if (organization.status !== 'pending-verification' || organization.platformSuspended) {
    return false
  }

  const organizationMemberships = await input.payload.find({
    collection: 'organization-memberships',
    depth: 0,
    limit: 2,
    overrideAccess: true,
    pagination: false,
    req: input.req,
    where: { organization: { equals: organizationID } },
  })
  if (
    organizationMemberships.docs.length !== 1 ||
    organizationMemberships.docs[0]?.id !== membership.id
  ) {
    return false
  }

  const workspaces = await input.payload.find({
    collection: 'workspaces',
    depth: 0,
    limit: 2,
    overrideAccess: true,
    pagination: false,
    req: input.req,
    where: { organization: { equals: organizationID } },
  })
  const workspace = workspaces.docs.length === 1 ? workspaces.docs[0] : null
  if (!workspace || workspace.status !== 'pending-verification' || workspace.platformSuspended) {
    return false
  }

  const domains = await input.payload.find({
    collection: 'domains',
    depth: 0,
    limit: 2,
    overrideAccess: true,
    pagination: false,
    req: input.req,
    where: { workspace: { equals: workspace.id } },
  })
  const domain = domains.docs.length === 1 ? domains.docs[0] : null
  const expectedHostname = buildManagedWorkspaceHostname(
    workspace.slug,
    input.managedLinkRootDomain,
  )
  if (
    !domain ||
    domain.type !== 'managed' ||
    domain.hostname !== expectedHostname ||
    domain.platformSuspended
  ) {
    return false
  }

  const apps = await input.payload.count({
    collection: 'apps',
    overrideAccess: true,
    req: input.req,
    where: { workspace: { equals: workspace.id } },
  })
  const fallbackOrigins = await input.payload.count({
    collection: 'fallback-origins',
    overrideAccess: true,
    req: input.req,
    where: { workspace: { equals: workspace.id } },
  })
  const invitations = await input.payload.count({
    collection: 'organization-invitations',
    overrideAccess: true,
    req: input.req,
    where: {
      or: [
        { organization: { equals: organizationID } },
        { invitedBy: { equals: input.user.id } },
        { acceptedBy: { equals: input.user.id } },
      ],
    },
  })
  const subscriptions = await input.payload.count({
    collection: 'subscriptions',
    overrideAccess: true,
    req: input.req,
    where: { organization: { equals: organizationID } },
  })
  const billingEvents = await input.payload.count({
    collection: 'billing-events',
    overrideAccess: true,
    req: input.req,
    where: { organization: { equals: organizationID } },
  })
  const usageCounters = await input.payload.count({
    collection: 'usage-counters',
    overrideAccess: true,
    req: input.req,
    where: { organization: { equals: organizationID } },
  })
  const abuseReports = await input.payload.count({
    collection: 'abuse-reports',
    overrideAccess: true,
    req: input.req,
    where: {
      or: [{ workspace: { equals: workspace.id } }, { domain: { equals: domain.id } }],
    },
  })
  const abuseCases = await input.payload.count({
    collection: 'abuse-cases',
    overrideAccess: true,
    req: input.req,
    where: {
      or: [{ workspace: { equals: workspace.id } }, { domain: { equals: domain.id } }],
    },
  })
  const enforcementEvents = await input.payload.count({
    collection: 'enforcement-events',
    overrideAccess: true,
    req: input.req,
    where: {
      or: [
        {
          and: [
            { resourceType: { equals: 'organization' } },
            { resourceID: { equals: String(organizationID) } },
          ],
        },
        {
          and: [
            { resourceType: { equals: 'workspace' } },
            { resourceID: { equals: String(workspace.id) } },
          ],
        },
        {
          and: [
            { resourceType: { equals: 'domain' } },
            { resourceID: { equals: String(domain.id) } },
          ],
        },
      ],
    },
  })
  if (
    [
      apps,
      fallbackOrigins,
      invitations,
      subscriptions,
      billingEvents,
      usageCounters,
      abuseReports,
      abuseCases,
      enforcementEvents,
    ].some((result) => result.totalDocs > 0)
  ) {
    return false
  }

  return {
    domainID: domain.id,
    membershipID: membership.id,
    organizationID,
    userID: input.user.id,
    workspaceID: workspace.id,
  }
}

async function reclaimPendingSignup(input: {
  managedLinkRootDomain: string
  now: Date
  payload: Payload
  req: PayloadRequest
  user: User
}): Promise<boolean> {
  await acquireTransactionLock(input.req, 'cloud-pending-signup', String(input.user.id))
  const graph = await canReclaimPendingSignup(input)
  if (!graph) return false

  await input.payload.delete({
    collection: 'domains',
    id: graph.domainID,
    overrideAccess: true,
    req: input.req,
  })
  await input.payload.delete({
    collection: 'organization-memberships',
    context: { [MEMBERSHIP_OWNER_OVERRIDE_CONTEXT]: true },
    id: graph.membershipID,
    overrideAccess: true,
    req: input.req,
  })
  await input.payload.delete({
    collection: 'workspaces',
    id: graph.workspaceID,
    overrideAccess: true,
    req: input.req,
  })
  await input.payload.delete({
    collection: 'organizations',
    id: graph.organizationID,
    overrideAccess: true,
    req: input.req,
  })
  await input.payload.delete({
    collection: 'users',
    id: graph.userID,
    overrideAccess: true,
    req: input.req,
  })
  return true
}

export async function createCloudSignup(
  input: CloudSignupInput,
  options: CloudSignupServiceOptions,
): Promise<CloudSignupResult> {
  const gate = evaluateCloudSignupGate({
    cloudSignupEnabled: process.env.CLOUD_SIGNUP_ENABLED,
    linksetGoEdition: process.env.RELAY_EDITION,
  })
  if (!gate.ok) {
    throw new CloudSignupError(
      'SIGNUP_UNAVAILABLE',
      'Self-service signup is available only when LinksetGo Cloud explicitly enables it.',
    )
  }

  const managedHostname = buildManagedWorkspaceHostname(
    input.workspaceSlug,
    options.managedLinkRootDomain,
  )
  if (!managedHostname) {
    throw new CloudSignupError('WORKSPACE_UNAVAILABLE', 'That workspace URL is unavailable.')
  }

  const now = (options.now ?? (() => new Date()))()
  const expiresAt = new Date(now.getTime() + CLOUD_VERIFICATION_TOKEN_TTL_MS).toISOString()
  const verificationToken = (options.randomToken ?? safeToken)()
  if (!isCloudVerificationToken(verificationToken)) {
    throw new CloudSignupError(
      'VERIFICATION_DELIVERY_FAILED',
      'A secure verification token could not be generated.',
    )
  }

  const req = await createLocalReq(
    {
      context: {
        [CLOUD_SIGNUP_CONTEXT_KEY]: true,
        [MANAGED_DOMAIN_PROVISIONING_CONTEXT_KEY]: options.managedLinkRootDomain,
      },
    },
    options.payload,
  )
  const ownsTransaction = await initTransaction(req)
  if (!ownsTransaction) {
    throw new CloudSignupError(
      'ATOMIC_SIGNUP_UNAVAILABLE',
      'The database could not start an atomic signup transaction.',
    )
  }

  try {
    const platformAdmins = await options.payload.find({
      collection: 'users',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      req,
      where: {
        and: [{ role: { equals: 'super-admin' } }, { status: { equals: 'active' } }],
      },
    })
    if (platformAdmins.docs.length === 0) {
      throw new CloudSignupError(
        'SETUP_REQUIRED',
        'LinksetGo Cloud must be bootstrapped by its platform owner before public signup.',
      )
    }

    const existingUsers = await options.payload.find({
      collection: 'users',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      req,
      showHiddenFields: true,
      where: { email: { equals: input.email } },
    })
    const existingUser = existingUsers.docs.length === 1 ? existingUsers.docs[0] : null
    if (
      existingUsers.docs.length > 0 &&
      (!existingUser ||
        !(await reclaimPendingSignup({
          managedLinkRootDomain: options.managedLinkRootDomain,
          now,
          payload: options.payload,
          req,
          user: existingUser,
        })))
    ) {
      throw new CloudSignupError('EMAIL_UNAVAILABLE', 'That account cannot be created.')
    }

    const organizations = await options.payload.find({
      collection: 'organizations',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      req,
      where: { slug: { equals: input.workspaceSlug } },
    })
    const workspaces = await options.payload.find({
      collection: 'workspaces',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      req,
      where: { slug: { equals: input.workspaceSlug } },
    })
    const domains = await options.payload.find({
      collection: 'domains',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      req,
      where: { hostname: { equals: managedHostname } },
    })
    if (organizations.docs.length || workspaces.docs.length || domains.docs.length) {
      throw new CloudSignupError('WORKSPACE_UNAVAILABLE', 'That workspace URL is unavailable.')
    }

    const user = await options.payload.create({
      collection: 'users',
      context: { [CLOUD_SIGNUP_CONTEXT_KEY]: true },
      data: {
        email: input.email,
        emailVerificationExpiresAt: expiresAt,
        emailVerificationTokenHash: hashCloudVerificationToken(verificationToken),
        name: input.name,
        password: input.password,
        role: 'viewer',
        status: 'pending-verification',
      },
      depth: 0,
      overrideAccess: true,
      req,
    })
    const organization = await options.payload.create({
      collection: 'organizations',
      data: {
        name: input.organizationName,
        slug: input.workspaceSlug,
        status: 'pending-verification',
      },
      depth: 0,
      overrideAccess: true,
      req,
    })
    const workspace = await options.payload.create({
      collection: 'workspaces',
      data: {
        name: `${input.organizationName} workspace`,
        organization: organization.id,
        slug: input.workspaceSlug,
        status: 'pending-verification',
      },
      depth: 0,
      overrideAccess: true,
      req,
    })
    await options.payload.create({
      collection: 'organization-memberships',
      data: {
        organization: organization.id,
        role: 'owner',
        status: 'disabled',
        user: user.id,
      },
      depth: 0,
      overrideAccess: true,
      req,
    })
    const evidenceAt = now.toISOString()
    await options.payload.create({
      collection: 'domains',
      context: {
        [MANAGED_DOMAIN_PROVISIONING_CONTEXT_KEY]: options.managedLinkRootDomain,
      },
      data: {
        activatedAt: evidenceAt,
        associationsVerifiedAt: evidenceAt,
        cnameVerifiedAt: evidenceAt,
        dnsVerifiedAt: evidenceAt,
        hostname: managedHostname,
        status: 'active',
        tlsReadyAt: evidenceAt,
        type: 'managed',
        verificationToken: safeToken(),
        workspace: workspace.id,
      },
      depth: 0,
      overrideAccess: true,
      req,
    })

    const verificationURL = new URL('/verify-email', options.appBaseURL)
    verificationURL.hash = new URLSearchParams({ token: verificationToken }).toString()
    try {
      await options.sendVerification({
        email: input.email,
        expiresAt,
        name: input.name,
        verificationURL: verificationURL.toString(),
      })
    } catch {
      throw new CloudSignupError(
        'VERIFICATION_DELIVERY_FAILED',
        'The verification email could not be queued.',
      )
    }

    await commitTransaction(req)
    return {
      email: input.email,
      expiresAt,
      managedHostname,
      organizationID: String(organization.id),
      userID: String(user.id),
      workspaceID: String(workspace.id),
    }
  } catch (error) {
    await killTransaction(req)
    if (error instanceof CloudSignupError) throw error
    throw new CloudSignupError(
      'SIGNUP_FAILED',
      'The account could not be created with those details.',
    )
  }
}

export async function resendCloudSignupVerification(
  email: string,
  options: CloudVerificationResendOptions,
): Promise<{ deliveryAttempted: boolean }> {
  const gate = evaluateCloudSignupGate({
    cloudSignupEnabled: process.env.CLOUD_SIGNUP_ENABLED,
    linksetGoEdition: process.env.RELAY_EDITION,
  })
  if (!gate.ok) return { deliveryAttempted: false }

  const now = (options.now ?? (() => new Date()))()
  const req = await createLocalReq({}, options.payload)
  const ownsTransaction = await initTransaction(req)
  if (!ownsTransaction) throw new Error('Could not start a verification-resend transaction.')

  try {
    const users = await options.payload.find({
      collection: 'users',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      req,
      showHiddenFields: true,
      where: {
        and: [{ email: { equals: email } }, { status: { equals: 'pending-verification' } }],
      },
    })
    let user = users.docs[0]
    if (
      !user ||
      !user.emailVerificationTokenHash ||
      !user.emailVerificationExpiresAt ||
      Date.parse(user.emailVerificationExpiresAt) <=
        now.getTime() - CLOUD_PENDING_SIGNUP_RECLAIM_GRACE_MS
    ) {
      await commitTransaction(req)
      return { deliveryAttempted: false }
    }

    await acquireTransactionLock(req, 'cloud-pending-signup', String(user.id))
    const lockedUsers = await options.payload.find({
      collection: 'users',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      req,
      showHiddenFields: true,
      where: {
        and: [
          { id: { equals: user.id } },
          { emailVerificationTokenHash: { equals: user.emailVerificationTokenHash } },
          { status: { equals: 'pending-verification' } },
        ],
      },
    })
    user = lockedUsers.docs[0]
    const createdAt = user ? Date.parse(user.createdAt) : Number.NaN
    const hardDeadline = createdAt + CLOUD_PENDING_SIGNUP_MAX_LIFETIME_MS
    if (
      !user ||
      !user.emailVerificationTokenHash ||
      !Number.isFinite(createdAt) ||
      hardDeadline <= now.getTime()
    ) {
      await commitTransaction(req)
      return { deliveryAttempted: false }
    }

    const memberships = await options.payload.find({
      collection: 'organization-memberships',
      depth: 0,
      limit: 2,
      overrideAccess: true,
      pagination: false,
      req,
      where: {
        and: [
          { user: { equals: user.id } },
          { role: { equals: 'owner' } },
          { status: { equals: 'disabled' } },
        ],
      },
    })
    const membership = memberships.docs.length === 1 ? memberships.docs[0] : null
    const organizationID = relationID(membership?.organization)
    if (!membership || !organizationID) {
      await commitTransaction(req)
      return { deliveryAttempted: false }
    }
    const workspaces = await options.payload.find({
      collection: 'workspaces',
      depth: 0,
      limit: 2,
      overrideAccess: true,
      pagination: false,
      req,
      where: {
        and: [
          { organization: { equals: numericID(organizationID) } },
          { status: { equals: 'pending-verification' } },
          { platformSuspended: { equals: false } },
        ],
      },
    })
    if (workspaces.docs.length !== 1) {
      await commitTransaction(req)
      return { deliveryAttempted: false }
    }

    const token = (options.randomToken ?? safeToken)()
    if (!isCloudVerificationToken(token)) throw new Error('Could not generate a reset token.')
    const expiresAt = new Date(
      Math.min(now.getTime() + CLOUD_VERIFICATION_TOKEN_TTL_MS, hardDeadline),
    ).toISOString()
    const claimed = await options.payload.update({
      collection: 'users',
      data: {
        emailVerificationExpiresAt: expiresAt,
        emailVerificationTokenHash: hashCloudVerificationToken(token),
      },
      depth: 0,
      overrideAccess: true,
      req,
      showHiddenFields: true,
      where: {
        and: [
          { id: { equals: user.id } },
          { emailVerificationTokenHash: { equals: user.emailVerificationTokenHash } },
          { status: { equals: 'pending-verification' } },
        ],
      },
    })
    if (claimed.docs.length !== 1) {
      await commitTransaction(req)
      return { deliveryAttempted: false }
    }

    const verificationURL = new URL('/verify-email', options.appBaseURL)
    verificationURL.hash = new URLSearchParams({ token }).toString()
    await options.sendVerification({
      email: user.email,
      expiresAt,
      name: user.name,
      verificationURL: verificationURL.toString(),
    })
    await commitTransaction(req)
    return { deliveryAttempted: true }
  } catch (error) {
    await killTransaction(req)
    throw error
  }
}

export async function verifyCloudSignupEmail(
  token: string,
  payload: Payload,
  now: Date = new Date(),
): Promise<CloudEmailVerificationResult> {
  if (process.env.RELAY_EDITION?.trim().toLowerCase() !== 'cloud') {
    throw new CloudSignupError(
      'VERIFICATION_FAILED',
      'Email verification is available only in LinksetGo Cloud.',
    )
  }
  if (!isCloudVerificationToken(token)) {
    throw new CloudSignupError('VERIFICATION_INVALID', 'This verification link is invalid.')
  }

  const tokenHash = hashCloudVerificationToken(token)
  const req = await createLocalReq({}, payload)
  const ownsTransaction = await initTransaction(req)
  if (!ownsTransaction) {
    throw new CloudSignupError(
      'ATOMIC_SIGNUP_UNAVAILABLE',
      'The database could not start an atomic verification transaction.',
    )
  }

  try {
    const users = await payload.find({
      collection: 'users',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      req,
      showHiddenFields: true,
      where: {
        and: [
          { emailVerificationTokenHash: { equals: tokenHash } },
          { status: { equals: 'pending-verification' } },
        ],
      },
    })
    let user = users.docs[0]
    if (
      !user ||
      !user.emailVerificationExpiresAt ||
      new Date(user.emailVerificationExpiresAt).getTime() <= now.getTime()
    ) {
      throw new CloudSignupError('VERIFICATION_INVALID', 'This verification link is invalid.')
    }

    await acquireTransactionLock(req, 'cloud-pending-signup', String(user.id))
    const lockedUsers = await payload.find({
      collection: 'users',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      req,
      showHiddenFields: true,
      where: {
        and: [
          { id: { equals: user.id } },
          { emailVerificationTokenHash: { equals: tokenHash } },
          { status: { equals: 'pending-verification' } },
        ],
      },
    })
    user = lockedUsers.docs[0]
    if (
      !user ||
      !user.emailVerificationExpiresAt ||
      new Date(user.emailVerificationExpiresAt).getTime() <= now.getTime()
    ) {
      throw new CloudSignupError('VERIFICATION_INVALID', 'This verification link is invalid.')
    }

    const memberships = await payload.find({
      collection: 'organization-memberships',
      depth: 0,
      limit: 2,
      overrideAccess: true,
      pagination: false,
      req,
      where: {
        and: [
          { user: { equals: user.id } },
          { role: { equals: 'owner' } },
          { status: { equals: 'disabled' } },
        ],
      },
    })
    const membership = memberships.docs.length === 1 ? memberships.docs[0] : null
    const organizationID = requireSingleRelation(membership?.organization)
    const workspaces = await payload.find({
      collection: 'workspaces',
      depth: 0,
      limit: 2,
      overrideAccess: true,
      pagination: false,
      req,
      where: {
        and: [
          { organization: { equals: numericID(organizationID) } },
          { status: { equals: 'pending-verification' } },
        ],
      },
    })
    const workspace = workspaces.docs.length === 1 ? workspaces.docs[0] : null
    if (!membership || !workspace) {
      throw new CloudSignupError('VERIFICATION_INVALID', 'Verification state is incomplete.')
    }

    const claimed = await payload.update({
      collection: 'users',
      data: {
        emailVerificationExpiresAt: null,
        emailVerificationTokenHash: null,
        status: 'active',
      },
      depth: 0,
      overrideAccess: true,
      req,
      showHiddenFields: true,
      where: {
        and: [
          { id: { equals: user.id } },
          { emailVerificationTokenHash: { equals: tokenHash } },
          { status: { equals: 'pending-verification' } },
        ],
      },
    })
    if (claimed.docs.length !== 1) {
      throw new CloudSignupError('VERIFICATION_INVALID', 'This verification link is invalid.')
    }

    await ensureFreeSubscriptionForOrganization(payload, numericID(organizationID), req)
    await payload.update({
      collection: 'organizations',
      id: numericID(organizationID),
      data: { status: 'active' },
      depth: 0,
      overrideAccess: true,
      req,
    })
    await payload.update({
      collection: 'workspaces',
      id: workspace.id,
      data: { status: 'active' },
      depth: 0,
      overrideAccess: true,
      req,
    })
    await payload.update({
      collection: 'organization-memberships',
      id: membership.id,
      data: { status: 'active' },
      depth: 0,
      overrideAccess: true,
      req,
    })

    await commitTransaction(req)
    return { email: user.email, workspaceSlug: workspace.slug }
  } catch (error) {
    await killTransaction(req)
    if (error instanceof CloudSignupError) throw error
    throw new CloudSignupError(
      'VERIFICATION_FAILED',
      'The account could not be verified right now.',
    )
  }
}

export async function pruneExpiredPendingCloudSignups(input: {
  batchSize?: number
  candidateUserIDs?: number[]
  managedLinkRootDomain: string
  now?: Date
  payload: Payload
}): Promise<PendingSignupPruneResult> {
  const batchSize = Math.max(1, Math.min(100, Math.floor(input.batchSize ?? 100)))
  const scanLimit = Math.min(1_000, batchSize * 10)
  const now = input.now ?? new Date()
  const cutoff = new Date(now.getTime() - CLOUD_PENDING_SIGNUP_RECLAIM_GRACE_MS).toISOString()
  const candidateUserIDs = input.candidateUserIDs
    ? [...new Set(input.candidateUserIDs)].filter((id) => Number.isSafeInteger(id) && id > 0)
    : null
  if (candidateUserIDs && candidateUserIDs.length === 0) {
    return { pruned: 0, scanned: 0, skipped: 0 }
  }
  const candidates = await input.payload.find({
    collection: 'users',
    depth: 0,
    limit: scanLimit,
    overrideAccess: true,
    pagination: false,
    showHiddenFields: true,
    sort: 'id',
    where: {
      and: [
        { status: { equals: 'pending-verification' } },
        { emailVerificationExpiresAt: { less_than_equal: cutoff } },
        ...(candidateUserIDs ? [{ id: { in: candidateUserIDs } }] : []),
      ],
    },
  })

  let pruned = 0
  let scanned = 0
  for (const candidate of candidates.docs) {
    if (pruned >= batchSize) break
    scanned += 1
    const req = await createLocalReq({}, input.payload)
    const ownsTransaction = await initTransaction(req)
    if (!ownsTransaction) throw new Error('Could not start a pending-signup prune transaction.')

    try {
      await acquireTransactionLock(req, 'cloud-pending-signup', String(candidate.id))
      const users = await input.payload.find({
        collection: 'users',
        depth: 0,
        limit: 1,
        overrideAccess: true,
        pagination: false,
        req,
        showHiddenFields: true,
        where: {
          and: [
            { id: { equals: candidate.id } },
            { status: { equals: 'pending-verification' } },
            { emailVerificationExpiresAt: { less_than_equal: cutoff } },
          ],
        },
      })
      const user = users.docs[0]
      const reclaimed =
        user &&
        (await reclaimPendingSignup({
          managedLinkRootDomain: input.managedLinkRootDomain,
          now,
          payload: input.payload,
          req,
          user,
        }))
      await commitTransaction(req)
      if (reclaimed) pruned += 1
    } catch (error) {
      await killTransaction(req)
      throw error
    }
  }

  return { pruned, scanned, skipped: scanned - pruned }
}
