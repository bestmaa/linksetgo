import type { FormEventHandler } from 'react'

import type { BadgeTone } from '@/components/ui/badge'
import type { DomainStatus } from '@/lib/client/payload-types'

export type DomainRowViewModel = {
  hostname: string
  id: string
  isSelected: boolean
  lastCheckedLabel: string
  onSelect: () => void
  status: DomainStatus
  statusDescription: string
  statusLabel: string
  statusTone: BadgeTone
  type: 'custom' | 'managed'
  typeLabel: string
}

export type DomainInstructionRecordViewModel = {
  name: string
  onCopyName: () => void
  onCopyValue: () => void
  type: 'CNAME' | 'TXT'
  value: string
}

export type SelectedDomainViewModel = DomainRowViewModel & {
  actionError: string | null
  actionLabel: string | null
  instructions: readonly DomainInstructionRecordViewModel[]
  instructionsError: string | null
  isActionRunning: boolean
  isLoadingInstructions: boolean
  onPrimaryAction: (() => void) | null
  releaseGuidance: string
  verificationError: string | null
}

export type DomainReleaseConfirmationViewModel = {
  error: string | null
  hostname: string
  isConfirmed: boolean
  isOpen: boolean
  isSaving: boolean
  onClose: () => void
  onConfirmedChange: (confirmed: boolean) => void
  onHostnameChange: (hostname: string) => void
  onSubmit: FormEventHandler<HTMLFormElement>
  targetHostname: string | null
}

export type DomainsViewProps = {
  domains: readonly DomainRowViewModel[]
  error: string | null
  hostname: string
  hostnameError: string | null
  isCreateOpen: boolean
  isLoading: boolean
  isSaving: boolean
  onCloseCreate: () => void
  onCreate: () => void
  onHostnameBlur: () => void
  onHostnameChange: (value: string) => void
  onRefresh: () => void
  onSubmit: FormEventHandler<HTMLFormElement>
  releaseConfirmation: DomainReleaseConfirmationViewModel
  selectedDomain: SelectedDomainViewModel | null
  submitError: string | null
  toast: string | null
  workspaceName: string | null
}
