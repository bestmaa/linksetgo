import type { FormEventHandler } from 'react'

import type { BadgeTone } from '@/components/ui/badge'

export type FallbackOriginRowViewModel = {
  hostname: string
  id: string
  isSelected: boolean
  lastCheckedLabel: string
  onSelect: () => void
  status: 'pending' | 'revoked' | 'verified' | 'verifying'
  statusLabel: string
  statusTone: BadgeTone
}

export type FallbackOriginRecordViewModel = {
  name: string
  onCopyName: () => void
  onCopyValue: () => void
  value: string
}

export type SelectedFallbackOriginViewModel = FallbackOriginRowViewModel & {
  actionError: string | null
  isActionRunning: boolean
  isLoadingInstructions: boolean
  onRequestRevoke: (() => void) | null
  onVerify: (() => void) | null
  record: FallbackOriginRecordViewModel | null
  verificationError: string | null
}

export type FallbackOriginRegistrationViewModel = {
  error: string | null
  hostname: string
  hostnameError: string | null
  isOpen: boolean
  isSaving: boolean
  onClose: () => void
  onHostnameBlur: () => void
  onHostnameChange: (value: string) => void
  onSubmit: FormEventHandler<HTMLFormElement>
}

export type FallbackOriginRevocationViewModel = {
  hostname: string | null
  isOpen: boolean
  isSaving: boolean
  onCancel: () => void
  onConfirm: () => void
}

export type FallbackOriginsViewProps = {
  error: string | null
  isLoading: boolean
  onCreate: () => void
  onRefresh: () => void
  origins: readonly FallbackOriginRowViewModel[]
  registration: FallbackOriginRegistrationViewModel
  required: boolean
  revocation: FallbackOriginRevocationViewModel
  selectedOrigin: SelectedFallbackOriginViewModel | null
  toast: string | null
  verificationAvailable: boolean
  verificationMessage: string | null
  workspaceName: string | null
}
