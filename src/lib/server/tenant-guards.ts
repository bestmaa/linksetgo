import type { CollectionBeforeValidateHook } from 'payload'
import { APIError } from 'payload'

import {
  canAccessOrganization,
  canAccessWorkspace,
  isActiveUserRequest,
  isPlatformSuperAdmin,
  organizationIDsForRequest,
  relationID,
  workspaceIDsForRequest,
} from './tenant-context'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const selectedRelation = (
  data: Record<string, unknown>,
  original: Record<string, unknown>,
  field: string,
): unknown => (Object.hasOwn(data, field) ? data[field] : original[field])

const relationshipInput = (id: string): number | string => (/^\d+$/.test(id) ? Number(id) : id)

const requireActiveUser = (isAuthenticated: boolean): void => {
  if (!isAuthenticated) throw new APIError('Authentication is required.', 401)
}

export const enforceWorkspaceOrganizationScope: CollectionBeforeValidateHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (!req.user || isPlatformSuperAdmin(req)) return data
  requireActiveUser(isActiveUserRequest(req))

  const next = isRecord(data) ? data : {}
  const previous = isRecord(originalDoc) ? originalDoc : {}
  let organizationID = relationID(selectedRelation(next, previous, 'organization'))

  if (!organizationID && operation === 'create') {
    const manageableOrganizations = await organizationIDsForRequest(req, 'manage')
    if (manageableOrganizations.length === 1) {
      organizationID = manageableOrganizations[0] ?? null
      if (organizationID) return { ...next, organization: relationshipInput(organizationID) }
    }
  }

  if (!organizationID || !(await canAccessOrganization(req, organizationID, 'manage'))) {
    throw new APIError('You cannot manage workspaces in this organization.', 403)
  }

  return data
}

export const enforceAppWorkspaceScope: CollectionBeforeValidateHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (!req.user || isPlatformSuperAdmin(req)) return data
  requireActiveUser(isActiveUserRequest(req))

  const next = isRecord(data) ? data : {}
  const previous = isRecord(originalDoc) ? originalDoc : {}
  let workspaceID = relationID(selectedRelation(next, previous, 'workspace'))

  if (!workspaceID && operation === 'create') {
    const manageableWorkspaces = await workspaceIDsForRequest(req, 'manage')
    if (manageableWorkspaces.length === 1) {
      workspaceID = manageableWorkspaces[0] ?? null
      if (workspaceID) return { ...next, workspace: relationshipInput(workspaceID) }
    }
  }

  if (!workspaceID && operation === 'update') {
    const legacyAppID = relationID(previous.id)
    const allowedApps = Array.isArray(req.user.allowedApps)
      ? req.user.allowedApps.map(relationID).filter(Boolean)
      : []
    if (req.user.role === 'admin' && legacyAppID && allowedApps.includes(legacyAppID)) return data
  }

  if (!workspaceID || !(await canAccessWorkspace(req, workspaceID, 'manage'))) {
    throw new APIError('Select a workspace you are allowed to manage.', 403)
  }

  return data
}

export const enforceDomainWorkspaceScope: CollectionBeforeValidateHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (!req.user || isPlatformSuperAdmin(req)) return data
  requireActiveUser(isActiveUserRequest(req))

  const next = isRecord(data) ? data : {}
  const previous = isRecord(originalDoc) ? originalDoc : {}
  let workspaceID = relationID(selectedRelation(next, previous, 'workspace'))

  if (!workspaceID && operation === 'create') {
    const manageableWorkspaces = await workspaceIDsForRequest(req, 'manage')
    if (manageableWorkspaces.length === 1) {
      workspaceID = manageableWorkspaces[0] ?? null
      if (workspaceID) return { ...next, workspace: relationshipInput(workspaceID) }
    }
  }

  if (!workspaceID || !(await canAccessWorkspace(req, workspaceID, 'manage'))) {
    throw new APIError('Select a workspace you are allowed to manage.', 403)
  }

  if (
    operation === 'update' &&
    relationID(previous.workspace) !== relationID(selectedRelation(next, previous, 'workspace'))
  ) {
    throw new APIError('A domain cannot be moved to another workspace.', 400)
  }

  return data
}

export const enforceMembershipScope: CollectionBeforeValidateHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (!req.user || isPlatformSuperAdmin(req)) return data
  requireActiveUser(isActiveUserRequest(req))

  const next = isRecord(data) ? data : {}
  const previous = isRecord(originalDoc) ? originalDoc : {}
  const organizationID = relationID(selectedRelation(next, previous, 'organization'))
  if (!organizationID || !(await canAccessOrganization(req, organizationID, 'manage'))) {
    throw new APIError('You cannot manage members in this organization.', 403)
  }

  if (operation === 'update') {
    const originalOrganizationID = relationID(previous.organization)
    const originalUserID = relationID(previous.user)
    const nextUserID = relationID(selectedRelation(next, previous, 'user'))
    if (organizationID !== originalOrganizationID || nextUserID !== originalUserID) {
      throw new APIError('A membership cannot be moved to another user or organization.', 400)
    }
  }

  const previousRole = previous.role
  const nextRole = Object.hasOwn(next, 'role') ? next.role : previousRole
  if (
    (previousRole === 'owner' || nextRole === 'owner') &&
    !(await canAccessOrganization(req, organizationID, 'own'))
  ) {
    throw new APIError('Only an organization owner can manage owner memberships.', 403)
  }

  return data
}
