import type { ChangeEventHandler, FormEventHandler } from 'react'

import type { AnalyticsDimensionDTO } from '@/lib/client/payload-types'
import type { BadgeTone } from '@/components/ui/badge'

export type LinkDetailAction = 'activate' | 'pause'

export type LinkParameterDraft = {
  id: string
  key: string
  value: string
}

export type LinkDetailForm = {
  destinationPath: string
  expiresAt: string
  fallbackUrl: string
  name: string
  parameters: LinkParameterDraft[]
}

export type LinkDetailFormErrors = Partial<
  Record<'destinationPath' | 'expiresAt' | 'fallbackUrl' | 'name' | 'parameters', string>
>

export type LinkDetailParameterViewModel = LinkParameterDraft & {
  onKeyChange: ChangeEventHandler<HTMLInputElement>
  onRemove: () => void
  onValueChange: ChangeEventHandler<HTMLInputElement>
}

export type LinkAnalyticsViewModel = {
  daily: readonly { count: number; date: string; height: string }[]
  error: string | null
  eventType: string
  events: readonly AnalyticsDimensionDTO[]
  exportHref: string | null
  from: string
  hosts: readonly AnalyticsDimensionDTO[]
  isLoading: boolean
  platform: string
  platforms: readonly AnalyticsDimensionDTO[]
  retentionNote: string
  to: string
  totalEvents: string
}

export type LinkDetailViewModel = {
  appName: string
  appStatus: string
  canManage: boolean
  effectiveStatus: string
  linkKey: string
  name: string
  nativeURL: string | null
  publicURL: string | null
  qrDataURL: string | null
  qrError: string | null
  statusTone: BadgeTone
  testHref: string | null
}

export type LinkDetailViewProps = {
  action: LinkDetailAction | null
  analytics: LinkAnalyticsViewModel
  detail: LinkDetailViewModel | null
  error: string | null
  form: Omit<LinkDetailForm, 'parameters'> & {
    parameters: readonly LinkDetailParameterViewModel[]
  }
  formErrors: LinkDetailFormErrors
  isEditing: boolean
  isLoading: boolean
  isSaving: boolean
  mutationError: string | null
  onActionCancel: () => void
  onActionConfirm: () => void
  onActionRequest: (action: LinkDetailAction) => void
  onAddParameter: () => void
  onAnalyticsFromChange: ChangeEventHandler<HTMLInputElement>
  onAnalyticsEventChange: ChangeEventHandler<HTMLSelectElement>
  onAnalyticsPlatformChange: ChangeEventHandler<HTMLSelectElement>
  onAnalyticsRetry: () => void
  onAnalyticsToChange: ChangeEventHandler<HTMLInputElement>
  onCloseEdit: () => void
  onCopyPublicURL: () => void
  onDownloadQR: () => void
  onFieldChange: (field: Exclude<keyof LinkDetailForm, 'parameters'>, value: string) => void
  onOpenEdit: () => void
  onRetry: () => void
  onSubmit: FormEventHandler<HTMLFormElement>
  toast: string | null
}
