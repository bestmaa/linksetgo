export type Identifier = string | number

export type PayloadList<T> = {
  docs: T[]
  hasNextPage: boolean
  hasPrevPage: boolean
  limit: number
  nextPage?: number | null
  page: number
  pagingCounter: number
  prevPage?: number | null
  totalDocs: number
  totalPages: number
}

export type UserDTO = {
  createdAt?: string
  email: string
  id: Identifier
  name?: string | null
  role?: 'super-admin' | 'admin' | 'viewer' | null
  status?: 'active' | 'disabled' | null
  updatedAt?: string
}

export type OrganizationDTO = {
  id: Identifier
  name: string
  slug: string
  status?: 'active' | 'suspended' | null
}

export type WorkspaceDTO = {
  id: Identifier
  name: string
  organization: Identifier | OrganizationDTO
  slug: string
  status?: 'active' | 'suspended' | null
}

export type DomainStatus =
  | 'active'
  | 'association-incomplete'
  | 'certificate-ready'
  | 'pending-dns'
  | 'suspended'
  | 'verifying'

export type DomainConsoleDTO = {
  hostname: string
  id: Identifier
  lastCheckedAt?: string | null
  lastVerificationError?: string | null
  status: DomainStatus
  type: 'custom' | 'managed'
  updatedAt?: string
}

export type DomainInstructionsDTO = {
  domain: DomainConsoleDTO
  records: {
    cname: {
      name: string
      target: string
      type: 'CNAME'
    }
    ownership: {
      name: string
      type: 'TXT'
      value: string
    }
  }
}

export type DomainActionResponseDTO = {
  domain: DomainConsoleDTO
  message: string
  stage: 'active' | 'association-confirmation-required' | 'certificate-pending'
}

export type FallbackOriginStatus = 'pending' | 'revoked' | 'verified' | 'verifying'

export type FallbackOriginConsoleDTO = {
  hostname: string
  id: Identifier
  lastCheckedAt?: string | null
  lastVerificationError?: string | null
  revokedAt?: string | null
  status: FallbackOriginStatus
  updatedAt?: string
  verifiedAt?: string | null
}

export type FallbackOriginListDTO = {
  docs: FallbackOriginConsoleDTO[]
  required: boolean
  verification: {
    available: boolean
    message: string | null
  }
}

export type FallbackOriginInstructionsDTO = {
  origin: FallbackOriginConsoleDTO
  record: {
    name: string
    type: 'TXT'
    value: string
  }
}

export type FallbackOriginActionDTO = {
  message: string
  origin: FallbackOriginConsoleDTO
}

export type OrganizationMembershipDTO = {
  id: Identifier
  organization: Identifier | OrganizationDTO
  role: 'admin' | 'member' | 'owner' | 'viewer'
  status?: 'active' | 'disabled' | null
  user: Identifier | UserDTO | null
}

export type TeamRole = 'admin' | 'member' | 'owner' | 'viewer'

export type TeamMemberConsoleDTO = {
  email: string
  id: Identifier
  isSelf: boolean
  name: string
  role: TeamRole
  status: 'active' | 'disabled'
  updatedAt?: string
  userId: Identifier
}

export type TeamInvitationConsoleDTO = {
  deliveryMode: 'manual' | 'webhook'
  email: string
  expiresAt: string
  id: Identifier
  invitedByName: string
  role: TeamRole
  status: 'accepted' | 'expired' | 'pending' | 'revoked'
}

export type TeamConsoleDTO = {
  canInviteOwner: boolean
  canManage: boolean
  canManualInvite: boolean
  invitations: TeamInvitationConsoleDTO[]
  members: TeamMemberConsoleDTO[]
  organizationId: Identifier
  organizationName: string
}

export type TeamInvitationPreviewDTO = {
  accountMode: 'accept' | 'create' | 'sign-in' | 'unavailable' | 'wrong-account'
  emailMasked: string
  organizationName: string
  role: TeamRole
}

export type TeamInvitationAcceptDTO = {
  organizationName: string
  signInRequired: boolean
  status: 'accepted'
}

export type TeamInvitationCreateDTO = {
  invitation: TeamInvitationConsoleDTO
  manualUrl?: string
}

export type AppStatus = 'active' | 'draft' | 'paused'

export type AppDTO = {
  allowedFallbackHosts?: string[] | null
  androidPackageName?: string | null
  androidSha256CertFingerprints?: string[] | null
  appStoreUrl?: string | null
  createdAt?: string
  description?: string | null
  fallbackUrl?: string | null
  id: Identifier
  iosBundleId?: string | null
  iosTeamId?: string | null
  name: string
  nativeScheme?: string | null
  playStoreUrl?: string | null
  publicKey?: string | null
  routingMode?: 'scheme-handoff' | 'verified-app-links' | null
  slug: string
  status?: AppStatus | null
  updatedAt?: string
  workspace?: Identifier | WorkspaceDTO | null
}

export type AppConsoleLinkDTO = {
  destinationPath: string
  expiresAt?: string | null
  id: Identifier
  name: string
  slug: string
  status?: LinkStatus | null
  updatedAt?: string
}

export type AppConsoleDetailDTO = {
  app: AppDTO
  links: AppConsoleLinkDTO[]
  totalLinks: number
}

export type AppConsoleConfigurationInput = {
  androidPackageName: string
  androidSha256CertFingerprints: string[]
  appStoreUrl: string
  description: string
  fallbackUrl: string
  iosBundleId: string
  iosTeamId: string
  name: string
  nativeScheme: string
  playStoreUrl: string
}

export type AppConsoleMutationInput =
  | {
      action: 'activate' | 'pause'
      workspaceId: string
    }
  | {
      action: 'save'
      configuration: AppConsoleConfigurationInput
      workspaceId: string
    }

export type LinkStatus = 'active' | 'draft' | 'paused' | 'expired'

export type DeepLinkDTO = {
  app: AppDTO | Identifier
  createdAt?: string
  destinationPath: string
  expiresAt?: string | null
  fallbackUrl?: string | null
  id: Identifier
  name: string
  parameters?: Record<string, unknown> | null
  slug: string
  status?: LinkStatus | null
  updatedAt?: string
}

export type LoginResponse = {
  exp?: number
  token?: string
  user: UserDTO
}

export type MeResponse = {
  collection?: string
  exp?: number
  strategy?: string
  token?: string
  user: UserDTO | null
}

export type CreateAppInput = {
  androidPackageName?: string
  androidSha256CertFingerprints?: string[]
  appStoreUrl?: string
  description?: string
  fallbackUrl?: string
  iosBundleId?: string
  iosTeamId?: string
  name: string
  nativeScheme: string
  playStoreUrl?: string
  slug: string
  status: AppStatus
  workspace?: Identifier
}

export type CreateDeepLinkInput = {
  app: Identifier
  destinationPath: string
  expiresAt?: string
  fallbackUrl?: string
  name: string
  parameters?: Record<string, string>
  slug: string
  status: LinkStatus
}

export type QuickLinkCreateInput = {
  appStoreUrl?: string
  fallbackUrl?: string
  name?: string
  nativeUrl: string
  playStoreUrl?: string
  workspaceId: string
}

export type QuickLinkCreateDTO = {
  appId: string
  appKey: string
  fallbackStatus: 'not-requested' | 'pending-verification' | 'ready'
  linkId: string
  linkSlug: string
  name: string
  publicUrl: string
}

export type LinkConsoleDetailDTO = {
  app: {
    id: Identifier
    name: string
    nativeScheme: string | null
    publicKey: string | null
    slug: string
    status: AppStatus
  }
  effectiveStatus: LinkStatus
  link: {
    destinationPath: string
    expiresAt: string | null
    fallbackUrl: string | null
    id: Identifier
    name: string
    parameters: Record<string, string>
    slug: string
    status: Exclude<LinkStatus, 'expired'>
    updatedAt?: string
  }
}

export type LinkConsoleConfigurationInput = {
  destinationPath: string
  expiresAt: string | null
  fallbackUrl: string | null
  name: string
  parameters: Record<string, string>
}

export type LinkConsoleMutationInput =
  | {
      action: 'activate' | 'pause'
      workspaceId: string
    }
  | {
      action: 'save'
      configuration: LinkConsoleConfigurationInput
      workspaceId: string
    }

export type PublicLinkResponse = {
  app: {
    appStoreUrl?: string | null
    fallbackUrl: string
    name: string
    playStoreUrl?: string | null
    slug: string
  }
  link: {
    destinationPath: string
    nativeUrl: string | null
    expiresAt?: string | null
    fallbackUrl?: string | null
    name: string
    parameters?: Record<string, unknown> | null
    slug: string
    status: 'active'
  }
  eventToken: string
  publicUrl: string
  status: 'active'
}

export type BillingSummaryDTO = {
  access: {
    canCreate: boolean
    canResolve: boolean
    reason: 'active' | 'canceled' | 'grace-period' | 'past-due' | 'paused'
  }
  edition: 'cloud' | 'community'
  plan: {
    key: 'community' | 'free' | 'pro' | 'starter'
    limits: {
      activeLinks: number | 'unlimited'
      analyticsRetentionDays: number | 'unlimited'
      apps: number | 'unlimited'
      customDomains: number | 'unlimited'
      members: number | 'unlimited'
      monthlyResolutions: number | 'unlimited'
      savedLinks: number | 'unlimited'
      workspaces: number | 'unlimited'
    }
    name: string
    priceMonthlyMinor: number | null
  }
  source: 'cloud-default' | 'community' | 'subscription'
  subscription: {
    currentPeriodEnd: string | null
    graceEndsAt: string | null
    status: 'active' | 'canceled' | 'past-due' | 'paused' | 'trialing'
  } | null
  usage: {
    monthlyResolutions: {
      kind: 'available' | 'blocked' | 'unlimited' | 'warning'
      limit: number | 'unlimited'
      used: number
    }
    periodStart: string
  }
}

export type BillingCheckoutDTO = {
  expiresAt: string | null
  kind: 'success'
  url: string
}

export type AnalyticsDimensionDTO = {
  count: number
  id: string
  label: string
}

export type AnalyticsSummaryDTO = {
  apps: AnalyticsDimensionDTO[]
  daily: { count: number; date: string }[]
  events: AnalyticsDimensionDTO[]
  hosts: AnalyticsDimensionDTO[]
  links: AnalyticsDimensionDTO[]
  platforms: AnalyticsDimensionDTO[]
  range: {
    from: string
    retentionDays: number
    retentionStartsAt: string
    to: string
    wasClamped: boolean
  }
  totalEvents: number
}

export type AnalyticsQueryInput = {
  appId?: string
  eventType?: string
  from?: string
  hostname?: string
  linkId?: string
  platform?: string
  to?: string
  workspaceId: string
}
