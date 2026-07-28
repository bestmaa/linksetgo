import type {
  Access,
  CollectionBeforeValidateHook,
  FieldAccess,
  PayloadRequest,
  Where,
} from 'payload'
import { APIError } from 'payload'

import {
  appIDsForRequest,
  canAccessApp,
  isActiveUserRequest,
  isPlatformSuperAdmin,
  organizationIDsForRequest,
  relationID,
  workspaceIDsForRequest,
} from './tenant-context'

export type UserRole = 'admin' | 'super-admin' | 'viewer'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const getRole = (req: PayloadRequest): null | UserRole => {
  const role = req.user?.role
  return role === 'admin' || role === 'super-admin' || role === 'viewer' ? role : null
}

export const isSuperAdminRequest = (req: PayloadRequest): boolean => isPlatformSuperAdmin(req)

export const canManageRequest = (req: PayloadRequest): boolean => {
  const role = getRole(req)
  return isActiveUserRequest(req) && (role === 'admin' || role === 'super-admin')
}

const idsWhere = (
  ids: readonly string[],
  field: 'app' | 'id' | 'organization' | 'workspace',
): false | Where => (ids.length > 0 ? { [field]: { in: [...ids] } } : false)

const appScopedWhere = async (
  req: PayloadRequest,
  field: 'app' | 'id',
  capability: 'manage' | 'read',
): Promise<boolean | Where> => {
  if (isSuperAdminRequest(req)) return true
  if (!isActiveUserRequest(req)) return false

  return idsWhere(await appIDsForRequest(req, capability), field)
}

const organizationScopedWhere = async (
  req: PayloadRequest,
  field: 'id' | 'organization',
  capability: 'manage' | 'own' | 'read',
): Promise<boolean | Where> => {
  if (isSuperAdminRequest(req)) return true
  if (!isActiveUserRequest(req)) return false

  return idsWhere(await organizationIDsForRequest(req, capability), field)
}

const workspaceScopedWhere = async (
  req: PayloadRequest,
  capability: 'manage' | 'own' | 'read',
): Promise<boolean | Where> => {
  if (isSuperAdminRequest(req)) return true
  if (!isActiveUserRequest(req)) return false

  return idsWhere(await workspaceIDsForRequest(req, capability), 'workspace')
}

const canManageTenantResources = async (req: PayloadRequest): Promise<boolean> => {
  if (isSuperAdminRequest(req)) return true
  if (!isActiveUserRequest(req)) return false
  return (await appIDsForRequest(req, 'manage')).length > 0
}

const canCreateWorkspace = async (req: PayloadRequest): Promise<boolean> => {
  if (isSuperAdminRequest(req)) return true
  if (!isActiveUserRequest(req)) return false
  return (await organizationIDsForRequest(req, 'manage')).length > 0
}

export const authenticatedAccess: Access = ({ req }) => isActiveUserRequest(req)
export const canManageAccess: Access = ({ req }) => canManageTenantResources(req)
export const superAdminAccess: Access = ({ req }) => isSuperAdminRequest(req)
export const superAdminFieldAccess: FieldAccess = ({ req }) => isSuperAdminRequest(req)

export const organizationReadAccess: Access = ({ req }) =>
  organizationScopedWhere(req, 'id', 'read')
export const organizationManageAccess: Access = ({ req }) =>
  organizationScopedWhere(req, 'id', 'manage')

export const workspaceCreateAccess: Access = ({ req }) => canCreateWorkspace(req)
export const workspaceReadAccess: Access = ({ req }) =>
  organizationScopedWhere(req, 'organization', 'read')
export const workspaceManageAccess: Access = ({ req }) =>
  organizationScopedWhere(req, 'organization', 'manage')
export const workspaceOwnerAccess: Access = ({ req }) =>
  organizationScopedWhere(req, 'organization', 'own')

export const domainCreateAccess: Access = ({ req }) => canCreateWorkspace(req)
export const domainReadAccess: Access = ({ req }) => workspaceScopedWhere(req, 'read')
export const domainManageAccess: Access = ({ req }) => workspaceScopedWhere(req, 'manage')
export const domainOwnerAccess: Access = ({ req }) => workspaceScopedWhere(req, 'own')

export const membershipCreateAccess: Access = ({ req }) => canCreateWorkspace(req)
export const membershipReadAccess: Access = ({ req }) =>
  organizationScopedWhere(req, 'organization', 'read')
export const membershipManageAccess: Access = ({ req }) =>
  organizationScopedWhere(req, 'organization', 'manage')
export const membershipDeleteAccess: Access = ({ req }) =>
  organizationScopedWhere(req, 'organization', 'own')

export const billingTenantReadAccess: Access = ({ req }) =>
  organizationScopedWhere(req, 'organization', 'read')
export const internalMutationAccess: Access = () => false

export const appCreateAccess: Access = ({ req }) => canCreateWorkspace(req)
export const appReadAccess: Access = ({ req }) => appScopedWhere(req, 'id', 'read')
export const appManageAccess: Access = ({ req }) => appScopedWhere(req, 'id', 'manage')
export const appScopedReadAccess: Access = ({ req }) => appScopedWhere(req, 'app', 'read')
export const appScopedManageAccess: Access = ({ req }) => appScopedWhere(req, 'app', 'manage')

export const selfOrSuperAdminAccess: Access = ({ req }) => {
  if (isSuperAdminRequest(req)) return true
  if (!isActiveUserRequest(req) || !req.user?.id) return false
  return { id: { equals: req.user.id } }
}

export const enforceAppScope: CollectionBeforeValidateHook = async ({ data, originalDoc, req }) => {
  if (!req.user || isSuperAdminRequest(req)) return data
  if (!isActiveUserRequest(req)) throw new APIError('You cannot manage this resource.', 403)

  const nextData = isRecord(data) ? data : {}
  const previousData = isRecord(originalDoc) ? originalDoc : {}
  const appID = relationID(nextData.app ?? previousData.app)

  if (!appID || !(await canAccessApp(req, appID, 'manage'))) {
    throw new APIError('You do not have access to this app.', 403)
  }

  return data
}
