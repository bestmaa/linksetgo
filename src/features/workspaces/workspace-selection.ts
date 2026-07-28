import type { OrganizationMembershipDTO, WorkspaceDTO } from '@/lib/client/payload-types'

export const WORKSPACE_STORAGE_KEY = 'relay.selected-workspace-id'

export type WorkspaceSummary = {
  id: string
  name: string
  organizationId: string
  organizationName: string
  role: 'admin' | 'member' | 'owner' | 'platform-admin' | 'viewer'
  slug: string
}

function relationId(value: unknown): string | null {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (!value || typeof value !== 'object' || !('id' in value)) return null
  const id = value.id
  return typeof id === 'string' || typeof id === 'number' ? String(id) : null
}

function relationName(value: unknown): string {
  if (!value || typeof value !== 'object' || !('name' in value)) return ''
  return typeof value.name === 'string' ? value.name : ''
}

export function buildWorkspaceSummaries(
  workspaces: readonly WorkspaceDTO[],
  memberships: readonly OrganizationMembershipDTO[],
  isPlatformAdmin: boolean,
): WorkspaceSummary[] {
  const roles = new Map(
    memberships.flatMap((membership) => {
      const organizationId = relationId(membership.organization)
      return organizationId && membership.status !== 'disabled'
        ? [[organizationId, membership.role] as const]
        : []
    }),
  )

  return workspaces.flatMap((workspace) => {
    const organizationId = relationId(workspace.organization)
    if (!organizationId || workspace.status === 'suspended') return []

    const role = roles.get(organizationId)
    if (!role && !isPlatformAdmin) return []

    return [
      {
        id: String(workspace.id),
        name: workspace.name,
        organizationId,
        organizationName: relationName(workspace.organization),
        role: role ?? 'platform-admin',
        slug: workspace.slug,
      },
    ]
  })
}

export function chooseSelectedWorkspaceId(
  workspaces: readonly Pick<WorkspaceSummary, 'id'>[],
  storedId: string | null,
): string | null {
  if (workspaces.length === 0) return null
  if (storedId && workspaces.some((workspace) => workspace.id === storedId)) return storedId
  return workspaces[0]?.id ?? null
}

export function readStoredWorkspaceId(): string | null {
  try {
    return window.localStorage.getItem(WORKSPACE_STORAGE_KEY)
  } catch {
    return null
  }
}

export function storeWorkspaceId(workspaceId: string | null): void {
  try {
    if (workspaceId) {
      window.localStorage.setItem(WORKSPACE_STORAGE_KEY, workspaceId)
    } else {
      window.localStorage.removeItem(WORKSPACE_STORAGE_KEY)
    }
  } catch {
    // Selection still works for this tab when storage is unavailable.
  }
}
