import type { FormEventHandler } from 'react'

import type { BadgeTone } from '@/components/ui/badge'

export type AppDetailAction = 'activate' | 'pause'

export type AppDetailForm = {
  androidPackageName: string
  androidSha256CertFingerprints: string
  appStoreUrl: string
  description: string
  fallbackUrl: string
  iosBundleId: string
  iosTeamId: string
  name: string
  nativeScheme: string
  playStoreUrl: string
}

export type AppDetailField = keyof AppDetailForm
export type AppDetailFormErrors = Partial<Record<AppDetailField, string>>

export type ReadinessValueViewModel = {
  label: string
  state: 'complete' | 'missing' | 'optional'
  value: string
}

export type PlatformReadinessViewModel = {
  complete: boolean
  description: string
  label: string
  remediation: readonly string[]
  values: readonly ReadinessValueViewModel[]
}

export type AppDetailLinkViewModel = {
  destination: string
  id: string
  name: string
  publicUrl: string | null
  status: string
  statusTone: BadgeTone
}

export type AppDetailViewModel = {
  activationHelp: string
  android: PlatformReadinessViewModel
  appKey: string
  appStoreUrl: string | null
  canActivate: boolean
  canManage: boolean
  description: string
  fallbackUrl: string
  id: string
  ios: PlatformReadinessViewModel
  linkCountLabel: string
  linksHref: string
  name: string
  nativeScheme: string | null
  playStoreUrl: string | null
  recentLinks: readonly AppDetailLinkViewModel[]
  status: 'active' | 'draft' | 'paused'
  statusTone: BadgeTone
  updatedLabel: string
  workspaceName: string
}

export type AppDetailViewProps = {
  app: AppDetailViewModel | null
  confirmation: AppDetailAction | null
  error: string | null
  form: AppDetailForm
  formErrors: AppDetailFormErrors
  isEditing: boolean
  isLoading: boolean
  isRuntimeDomainLoading: boolean
  isSaving: boolean
  mutationError: string | null
  onCancelAction: () => void
  onCloseEdit: () => void
  onConfirmAction: () => void
  onCreateLink: () => void
  onFieldChange: (field: AppDetailField, value: string) => void
  onOpenEdit: () => void
  onRequestAction: (action: AppDetailAction) => void
  onRetry: () => void
  onRetryRuntimeDomain: () => void
  onSubmit: FormEventHandler<HTMLFormElement>
  toast: string | null
  runtimeDomainError: string | null
}
