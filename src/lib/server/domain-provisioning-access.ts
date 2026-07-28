import 'server-only'

import type { Payload, PayloadRequest } from 'payload'

import type { Domain, User } from '@/payload-types'
import type { DomainActionResult } from './domain-provisioning-result'
import { relationID } from './tenant-context'

export const domainRelationInput = (value: string): number | string =>
  /^\d+$/.test(value) ? Number(value) : value

export async function loadAccessibleCustomDomain(input: {
  domainID: string
  payload: Payload
  req: PayloadRequest
  workspaceID: string
}): Promise<Domain | null> {
  const result = await input.payload.find({
    collection: 'domains',
    depth: 0,
    limit: 1,
    overrideAccess: false,
    pagination: false,
    req: input.req,
    where: {
      and: [
        { id: { equals: domainRelationInput(input.domainID) } },
        { workspace: { equals: domainRelationInput(input.workspaceID) } },
        { type: { equals: 'custom' } },
      ],
    },
  })
  return result.docs[0] ?? null
}

export async function provisioningHold(input: {
  domain: Domain
  payload: Payload
  req: PayloadRequest
}): Promise<DomainActionResult | null> {
  if (input.domain.platformSuspended || input.domain.status === 'suspended') {
    return {
      code: 'FORBIDDEN',
      domain: input.domain,
      message: 'This domain is suspended and cannot be provisioned.',
      ok: false,
      retryable: false,
      status: 403,
    }
  }

  const workspaceID = relationID(input.domain.workspace)
  if (!workspaceID) {
    return {
      code: 'INVALID_STATE',
      domain: input.domain,
      message: 'This domain is not attached to a valid workspace.',
      ok: false,
      retryable: false,
      status: 409,
    }
  }
  const workspace = await input.payload.findByID({
    collection: 'workspaces',
    id: domainRelationInput(workspaceID),
    depth: 0,
    overrideAccess: true,
    req: input.req,
  })
  if (workspace.status !== 'active' || workspace.platformSuspended) {
    return {
      code: 'FORBIDDEN',
      domain: input.domain,
      message: 'The owning workspace is suspended.',
      ok: false,
      retryable: false,
      status: 403,
    }
  }

  const organizationID = relationID(workspace.organization)
  if (!organizationID) {
    return {
      code: 'INVALID_STATE',
      domain: input.domain,
      message: 'The owning workspace has no valid organization.',
      ok: false,
      retryable: false,
      status: 409,
    }
  }
  const organization = await input.payload.findByID({
    collection: 'organizations',
    id: domainRelationInput(organizationID),
    depth: 0,
    overrideAccess: true,
    req: input.req,
  })
  return organization.status !== 'active' || organization.platformSuspended
    ? {
        code: 'FORBIDDEN',
        domain: input.domain,
        message: 'The owning organization is suspended.',
        ok: false,
        retryable: false,
        status: 403,
      }
    : null
}

export async function canConfirmDomainRelease(input: {
  domain: Domain
  payload: Payload
  req: PayloadRequest
  user: User
  workspaceID: string
}): Promise<DomainActionResult | null> {
  const workspace = await input.payload.findByID({
    collection: 'workspaces',
    id: domainRelationInput(input.workspaceID),
    depth: 0,
    overrideAccess: true,
    req: input.req,
  })
  const organizationID = relationID(workspace.organization)
  if (!organizationID) {
    return {
      code: 'RELEASE_NOT_READY',
      domain: input.domain,
      message: 'This workspace has no active organization owner.',
      ok: false,
      retryable: false,
      status: 409,
    }
  }

  if (input.user.role !== 'super-admin') {
    const memberships = await input.payload.find({
      collection: 'organization-memberships',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      req: input.req,
      where: {
        and: [
          { organization: { equals: domainRelationInput(organizationID) } },
          { user: { equals: input.user.id } },
          { role: { equals: 'owner' } },
          { status: { equals: 'active' } },
        ],
      },
    })
    if (!memberships.docs[0]) {
      return {
        code: 'FORBIDDEN',
        domain: input.domain,
        message: 'Only an organization owner can confirm a released mobile hostname.',
        ok: false,
        retryable: false,
        status: 403,
      }
    }
  }

  const apps = await input.payload.find({
    collection: 'apps',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    req: input.req,
    where: {
      and: [
        { workspace: { equals: domainRelationInput(input.workspaceID) } },
        { status: { equals: 'active' } },
        { platformSuspended: { equals: false } },
      ],
    },
  })
  return apps.docs[0]
    ? null
    : {
        code: 'RELEASE_NOT_READY',
        domain: input.domain,
        message: 'Activate at least one release-ready app before confirming this hostname.',
        ok: false,
        retryable: false,
        status: 409,
      }
}
