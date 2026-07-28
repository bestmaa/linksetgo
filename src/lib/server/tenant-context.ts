import type { PayloadRequest } from 'payload'

export type OrganizationRole = 'admin' | 'member' | 'owner' | 'viewer'
export type TenantCapability = 'manage' | 'own' | 'read'

type MembershipGrant = {
  organizationID: string
  role: OrganizationRole
}

type RelationValue = number | string | { id: number | string }

const membershipCache = new WeakMap<PayloadRequest, Promise<MembershipGrant[]>>()

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export const relationID = (value: unknown): null | string => {
  if (typeof value === 'number' || typeof value === 'string') return String(value)
  if (!isRecord(value)) return null

  const id = value.id
  return typeof id === 'number' || typeof id === 'string' ? String(id) : null
}

export const isActiveUserRequest = (req: PayloadRequest): boolean => req.user?.status === 'active'

export const isPlatformSuperAdmin = (req: PayloadRequest): boolean =>
  isActiveUserRequest(req) && req.user?.role === 'super-admin'

const roleAllows = (role: OrganizationRole, capability: TenantCapability): boolean => {
  if (capability === 'read') return true
  if (capability === 'manage') return role === 'owner' || role === 'admin'
  return role === 'owner'
}

const isOrganizationRole = (value: unknown): value is OrganizationRole =>
  value === 'owner' || value === 'admin' || value === 'member' || value === 'viewer'

const loadMembershipGrants = async (req: PayloadRequest): Promise<MembershipGrant[]> => {
  if (!isActiveUserRequest(req) || !req.user?.id) return []

  const result = await req.payload.find({
    collection: 'organization-memberships',
    depth: 0,
    limit: 500,
    overrideAccess: true,
    pagination: false,
    req,
    where: {
      and: [{ user: { equals: req.user.id } }, { status: { equals: 'active' } }],
    },
  })

  const grants = result.docs.flatMap((membership) => {
    const organizationID = relationID(membership.organization)
    return organizationID && isOrganizationRole(membership.role)
      ? [{ organizationID, role: membership.role }]
      : []
  })
  if (grants.length === 0) return []

  const activeOrganizations = await req.payload.find({
    collection: 'organizations',
    depth: 0,
    limit: 500,
    overrideAccess: true,
    pagination: false,
    req,
    where: {
      and: [
        { id: { in: grants.map((grant) => grant.organizationID) } },
        { status: { equals: 'active' } },
        { platformSuspended: { equals: false } },
      ],
    },
  })
  const activeIDs = new Set(activeOrganizations.docs.map((organization) => String(organization.id)))

  return grants.filter((grant) => activeIDs.has(grant.organizationID))
}

export const membershipGrantsForRequest = (req: PayloadRequest): Promise<MembershipGrant[]> => {
  const cached = membershipCache.get(req)
  if (cached) return cached

  const grants = loadMembershipGrants(req)
  membershipCache.set(req, grants)
  return grants
}

export const organizationIDsForRequest = async (
  req: PayloadRequest,
  capability: TenantCapability,
): Promise<string[]> => {
  const grants = await membershipGrantsForRequest(req)
  return grants
    .filter((grant) => roleAllows(grant.role, capability))
    .map((grant) => grant.organizationID)
}

export const workspaceIDsForRequest = async (
  req: PayloadRequest,
  capability: TenantCapability,
): Promise<string[]> => {
  const organizationIDs = await organizationIDsForRequest(req, capability)
  if (organizationIDs.length === 0) return []

  const workspaces = await req.payload.find({
    collection: 'workspaces',
    depth: 0,
    limit: 500,
    overrideAccess: true,
    pagination: false,
    req,
    where: {
      and: [
        { organization: { in: organizationIDs } },
        { status: { equals: 'active' } },
        { platformSuspended: { equals: false } },
      ],
    },
  })

  return workspaces.docs.map((workspace) => String(workspace.id))
}

const legacyAllowedAppIDs = (req: PayloadRequest): string[] => {
  const values = req.user?.allowedApps
  if (!Array.isArray(values)) return []

  return values
    .map((value: RelationValue) => relationID(value))
    .filter((value): value is string => value !== null)
}

export const appIDsForRequest = async (
  req: PayloadRequest,
  capability: Exclude<TenantCapability, 'own'>,
): Promise<string[]> => {
  const workspaceIDs = await workspaceIDsForRequest(req, capability)
  const legacyIDs =
    capability === 'read' || req.user?.role === 'admin' ? legacyAllowedAppIDs(req) : []
  if (workspaceIDs.length === 0) return [...new Set(legacyIDs)]

  const apps = await req.payload.find({
    collection: 'apps',
    depth: 0,
    limit: 1000,
    overrideAccess: true,
    pagination: false,
    req,
    where: {
      and: [{ workspace: { in: workspaceIDs } }, { platformSuspended: { equals: false } }],
    },
  })

  return [...new Set([...legacyIDs, ...apps.docs.map((app) => String(app.id))])]
}

export const canAccessOrganization = async (
  req: PayloadRequest,
  organizationID: string,
  capability: TenantCapability,
): Promise<boolean> =>
  isPlatformSuperAdmin(req) ||
  (await organizationIDsForRequest(req, capability)).includes(organizationID)

export const canAccessWorkspace = async (
  req: PayloadRequest,
  workspaceID: string,
  capability: TenantCapability,
): Promise<boolean> =>
  isPlatformSuperAdmin(req) || (await workspaceIDsForRequest(req, capability)).includes(workspaceID)

export const canAccessApp = async (
  req: PayloadRequest,
  appID: string,
  capability: Exclude<TenantCapability, 'own'>,
): Promise<boolean> =>
  isPlatformSuperAdmin(req) || (await appIDsForRequest(req, capability)).includes(appID)
