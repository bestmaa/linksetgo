import type {
  AnalyticsQueryInput,
  AnalyticsSummaryDTO,
  AppDTO,
  AppConsoleDetailDTO,
  AppConsoleMutationInput,
  BillingCheckoutDTO,
  BillingSummaryDTO,
  CreateAppInput,
  CreateDeepLinkInput,
  DeepLinkDTO,
  DomainActionResponseDTO,
  DomainConsoleDTO,
  DomainInstructionsDTO,
  FallbackOriginActionDTO,
  FallbackOriginConsoleDTO,
  FallbackOriginInstructionsDTO,
  FallbackOriginListDTO,
  LinkConsoleDetailDTO,
  LinkConsoleMutationInput,
  LoginResponse,
  MeResponse,
  OrganizationMembershipDTO,
  PayloadList,
  PublicLinkResponse,
  TeamConsoleDTO,
  TeamInvitationAcceptDTO,
  TeamInvitationCreateDTO,
  TeamInvitationPreviewDTO,
  TeamRole,
  WorkspaceDTO,
} from './payload-types'

type QueryValue = boolean | number | string | null | undefined

export class PayloadRequestError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'PayloadRequestError'
    this.status = status
  }
}

function createQuery(values: Record<string, QueryValue>) {
  const query = new URLSearchParams()
  Object.entries(values).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') {
      query.set(key, String(value))
    }
  })
  const serialized = query.toString()
  return serialized ? `?${serialized}` : ''
}

function createDeepLinkPageQuery(options: {
  appId?: string
  appIds?: readonly (number | string)[]
  limit: number
  page: number
  search?: string
  status?: string
}) {
  const query = new URLSearchParams({
    depth: '1',
    limit: String(options.limit),
    page: String(options.page),
    sort: '-updatedAt',
  })
  let clause = 0
  const prefix = () => `where[and][${clause++}]`
  if (options.appId) query.set(`${prefix()}[app][equals]`, options.appId)
  else if (options.appIds?.length) {
    query.set(`${prefix()}[app][in]`, options.appIds.join(','))
  }
  if (options.search) {
    const searchPrefix = prefix()
    query.set(`${searchPrefix}[or][0][name][contains]`, options.search)
    query.set(`${searchPrefix}[or][1][slug][contains]`, options.search)
    query.set(`${searchPrefix}[or][2][destinationPath][contains]`, options.search)
  }
  const now = new Date().toISOString()
  if (options.status === 'expired') {
    query.set(`${prefix()}[status][equals]`, 'active')
    query.set(`${prefix()}[expiresAt][less_than_equal]`, now)
  } else if (options.status === 'active') {
    query.set(`${prefix()}[status][equals]`, 'active')
    const expiryPrefix = prefix()
    query.set(`${expiryPrefix}[or][0][expiresAt][exists]`, 'false')
    query.set(`${expiryPrefix}[or][1][expiresAt][greater_than]`, now)
  } else if (options.status) {
    query.set(`${prefix()}[status][equals]`, options.status)
  }
  return `?${query.toString()}`
}

async function readError(response: Response) {
  const fallback = `Request failed with status ${response.status}`
  try {
    const value = (await response.json()) as {
      error?: { message?: string }
      errors?: { message?: string }[]
      message?: string
    }
    return value.errors?.[0]?.message ?? value.error?.message ?? value.message ?? fallback
  } catch {
    return fallback
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })

  if (!response.ok) {
    throw new PayloadRequestError(await readError(response), response.status)
  }

  return (await response.json()) as T
}

const PUBLIC_SESSION_KEY = 'relay-public-session'

function createPublicSessionID(): string {
  if (typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID()

  const bytes = window.crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
}

function getPublicSessionID(): string | undefined {
  if (typeof window === 'undefined') return undefined

  try {
    const existing = window.sessionStorage.getItem(PUBLIC_SESSION_KEY)
    if (existing) return existing

    const sessionID = createPublicSessionID()
    window.sessionStorage.setItem(PUBLIC_SESSION_KEY, sessionID)
    return sessionID
  } catch {
    return undefined
  }
}

export const payloadClient = {
  createApp(input: CreateAppInput) {
    return request<AppDTO>('/api/apps', {
      body: JSON.stringify(input),
      method: 'POST',
    })
  },

  createDeepLink(input: CreateDeepLinkInput) {
    return request<DeepLinkDTO>('/api/deep-links', {
      body: JSON.stringify(input),
      method: 'POST',
    })
  },

  createCustomDomain(input: { hostname: string; workspaceId: string }) {
    return request<DomainConsoleDTO>('/api/admin/domains', {
      body: JSON.stringify(input),
      method: 'POST',
    })
  },

  createFallbackOrigin(input: { hostname: string; workspaceId: string }) {
    return request<FallbackOriginConsoleDTO>('/api/admin/fallback-origins', {
      body: JSON.stringify(input),
      method: 'POST',
    })
  },

  createBillingCheckout(workspaceId: string, plan: 'pro' | 'starter') {
    return request<BillingCheckoutDTO>('/api/admin/billing/checkout', {
      body: JSON.stringify({ plan, workspaceId }),
      method: 'POST',
    })
  },

  getCurrentUser() {
    return request<MeResponse>('/api/users/me')
  },

  getConsoleApp(appId: string, workspaceId: string) {
    const query = createQuery({ workspaceId })
    return request<AppConsoleDetailDTO>(`/api/admin/apps/${encodeURIComponent(appId)}${query}`)
  },

  getConsoleLink(linkId: string, workspaceId: string) {
    const query = createQuery({ workspaceId })
    return request<LinkConsoleDetailDTO>(`/api/admin/links/${encodeURIComponent(linkId)}${query}`)
  },

  getDomainInstructions(domainId: string, workspaceId: string) {
    const query = createQuery({ workspaceId })
    return request<DomainInstructionsDTO>(
      `/api/admin/domains/${encodeURIComponent(domainId)}/instructions${query}`,
    )
  },

  getFallbackOriginInstructions(originId: string, workspaceId: string) {
    const query = createQuery({ workspaceId })
    return request<FallbackOriginInstructionsDTO>(
      `/api/admin/fallback-origins/${encodeURIComponent(originId)}/instructions${query}`,
    )
  },

  runDomainVerification(domainId: string, workspaceId: string) {
    return request<DomainActionResponseDTO>(
      `/api/admin/domains/${encodeURIComponent(domainId)}/actions`,
      {
        body: JSON.stringify({ action: 'verify', workspaceId }),
        method: 'POST',
      },
    )
  },

  confirmDomainAssociations(domainId: string, workspaceId: string, hostname: string) {
    return request<DomainActionResponseDTO>(
      `/api/admin/domains/${encodeURIComponent(domainId)}/actions`,
      {
        body: JSON.stringify({
          action: 'confirm-associations',
          confirmReleasedApps: true,
          hostname,
          workspaceId,
        }),
        method: 'POST',
      },
    )
  },

  getBillingSummary(workspaceId: string) {
    const query = createQuery({ workspaceId })
    return request<BillingSummaryDTO>(`/api/admin/billing${query}`)
  },

  getAnalyticsSummary(input: AnalyticsQueryInput) {
    const query = createQuery(input)
    return request<AnalyticsSummaryDTO>(`/api/admin/analytics${query}`)
  },

  getAnalyticsExportURL(input: AnalyticsQueryInput) {
    return `/api/admin/analytics/export${createQuery(input)}`
  },

  async getAppBySlug(slug: string, workspaceId: string) {
    const query = createQuery({
      depth: 0,
      limit: 1,
      'where[workspace][equals]': workspaceId,
      'where[slug][equals]': slug,
    })
    const response = await request<PayloadList<AppDTO>>(`/api/apps${query}`)
    return response.docs[0] ?? null
  },

  getPublicLink(appSlug: string, linkSlug: string) {
    return request<PublicLinkResponse>(
      `/api/public/links/${encodeURIComponent(appSlug)}/${encodeURIComponent(linkSlug)}`,
    )
  },

  getTeam(organizationId: string) {
    const query = createQuery({ organizationId })
    return request<TeamConsoleDTO>(`/api/admin/team${query}`)
  },

  listApps(options: { limit?: number; search?: string; workspaceId?: string } = {}) {
    const query = createQuery({
      depth: 0,
      limit: options.limit ?? 100,
      sort: '-updatedAt',
      'where[name][contains]': options.search,
      'where[workspace][equals]': options.workspaceId,
    })
    return request<PayloadList<AppDTO>>(`/api/apps${query}`)
  },

  listDeepLinks(
    options: {
      appId?: string
      appIds?: readonly (number | string)[]
      limit?: number
      search?: string
      status?: string
    } = {},
  ) {
    const query = createQuery({
      depth: 1,
      limit: options.limit ?? 100,
      sort: '-updatedAt',
      'where[name][contains]': options.search,
      'where[app][equals]': options.appId,
      'where[app][in]': options.appIds?.join(','),
      'where[status][equals]': options.status,
    })
    return request<PayloadList<DeepLinkDTO>>(`/api/deep-links${query}`)
  },

  listDeepLinksPage(options: {
    appId?: string
    appIds?: readonly (number | string)[]
    limit?: number
    page?: number
    search?: string
    status?: string
  }) {
    return request<PayloadList<DeepLinkDTO>>(
      `/api/deep-links${createDeepLinkPageQuery({
        ...options,
        limit: options.limit ?? 25,
        page: options.page ?? 1,
      })}`,
    )
  },

  listDomains(workspaceId: string) {
    const query = createQuery({ workspaceId })
    return request<{ docs: DomainConsoleDTO[] }>(`/api/admin/domains${query}`)
  },

  listFallbackOrigins(workspaceId: string) {
    const query = createQuery({ workspaceId })
    return request<FallbackOriginListDTO>(`/api/admin/fallback-origins${query}`)
  },

  listLinkEvents(options: { appIds?: readonly (number | string)[] } = {}) {
    const query = createQuery({
      depth: 0,
      limit: 1,
      'where[app][in]': options.appIds?.join(','),
    })
    return request<PayloadList<{ id: string | number }>>(`/api/link-events${query}`)
  },

  listOrganizationMemberships(
    options: {
      depth?: number
      limit?: number
      organizationId?: string
      userId?: string
    } = {},
  ) {
    const query = createQuery({
      depth: options.depth ?? 1,
      limit: options.limit ?? 100,
      sort: 'createdAt',
      'where[organization][equals]': options.organizationId,
      'where[user][equals]': options.userId,
    })
    return request<PayloadList<OrganizationMembershipDTO>>(`/api/organization-memberships${query}`)
  },

  listWorkspaces(options: { depth?: number; limit?: number } = {}) {
    const query = createQuery({
      depth: options.depth ?? 1,
      limit: options.limit ?? 100,
      sort: 'name',
      'where[status][equals]': 'active',
    })
    return request<PayloadList<WorkspaceDTO>>(`/api/workspaces${query}`)
  },

  login(email: string, password: string) {
    return request<LoginResponse>('/api/users/login', {
      body: JSON.stringify({ email, password }),
      method: 'POST',
    })
  },

  logout() {
    return request<{ message: string }>('/api/users/logout', { method: 'POST' })
  },

  createTeamInvitation(input: {
    delivery: 'manual' | 'webhook'
    email: string
    organizationId: string
    role: TeamRole
  }) {
    return request<TeamInvitationCreateDTO>('/api/admin/team/invitations', {
      body: JSON.stringify(input),
      method: 'POST',
    })
  },

  revokeTeamInvitation(invitationId: string, organizationId: string) {
    return request<{ status: 'revoked' }>(
      `/api/admin/team/invitations/${encodeURIComponent(invitationId)}`,
      {
        body: JSON.stringify({ organizationId }),
        method: 'PATCH',
      },
    )
  },

  updateTeamMember(
    membershipId: string,
    input:
      | { action: 'remove'; organizationId: string }
      | {
          action: 'update'
          organizationId: string
          role: TeamRole
          status: 'active' | 'disabled'
        },
  ) {
    return request<TeamConsoleDTO>(`/api/admin/team/members/${encodeURIComponent(membershipId)}`, {
      body: JSON.stringify(input),
      method: 'PATCH',
    })
  },

  previewTeamInvitation(token: string) {
    return request<TeamInvitationPreviewDTO>('/api/auth/team-invitations/preview', {
      body: JSON.stringify({ token }),
      method: 'POST',
    })
  },

  acceptTeamInvitation(input: { name?: string; password?: string; token: string }) {
    return request<TeamInvitationAcceptDTO>('/api/auth/team-invitations/accept', {
      body: JSON.stringify(input),
      method: 'POST',
    })
  },

  updateConsoleApp(appId: string, input: AppConsoleMutationInput) {
    return request<AppConsoleDetailDTO>(`/api/admin/apps/${encodeURIComponent(appId)}`, {
      body: JSON.stringify(input),
      method: 'PATCH',
    })
  },

  updateConsoleLink(linkId: string, input: LinkConsoleMutationInput) {
    return request<LinkConsoleDetailDTO>(`/api/admin/links/${encodeURIComponent(linkId)}`, {
      body: JSON.stringify(input),
      method: 'PATCH',
    })
  },

  runFallbackOriginAction(originId: string, workspaceId: string, action: 'revoke' | 'verify') {
    return request<FallbackOriginActionDTO>(
      `/api/admin/fallback-origins/${encodeURIComponent(originId)}/actions`,
      {
        body: JSON.stringify({ action, workspaceId }),
        method: 'POST',
      },
    )
  },

  recordPublicEvent(input: {
    appSlug: string
    eventType: 'app-opened' | 'fallback-viewed' | 'open-app-clicked' | 'store-clicked'
    linkSlug: string
  }) {
    const sessionID = getPublicSessionID()
    return request<{ accepted: true }>('/api/public/link-events', {
      body: JSON.stringify(sessionID ? { ...input, sessionID } : input),
      keepalive: true,
      method: 'POST',
    })
  },
}

export function isUnauthorized(error: unknown) {
  return error instanceof PayloadRequestError && (error.status === 401 || error.status === 403)
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'An unexpected error occurred.'
}
