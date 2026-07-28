import type { ChangeEventHandler, FormEventHandler } from 'react'

import type { BadgeTone } from '@/components/ui/badge'

export type AppOptionViewModel = {
  id: string
  label: string
  nativeScheme: string | null
  slug: string
}

export type ParameterRowViewModel = {
  id: string
  key: string
  onKeyChange: ChangeEventHandler<HTMLInputElement>
  onRemove: () => void
  onValueChange: ChangeEventHandler<HTMLInputElement>
  value: string
}

export type LinkFormViewModel = {
  appId: string
  destinationPath: string
  expiresAt: string
  fallbackUrl: string
  name: string
  parameters: readonly ParameterRowViewModel[]
  publicUrl: string
  slug: string
  status: 'active' | 'draft'
}

export type NativeImportFeedback =
  { kind: 'error'; message: string } | { kind: 'success'; message: string }

export type CreatedLinkViewModel = {
  name: string
  onCopy: () => void
  onDismiss: () => void
  publicUrl: string
  testHref: string
}

export type LinkRowViewModel = {
  appName: string
  destination: string
  detailsHref: string
  id: string
  name: string
  onCopy: () => void
  publicUrl: string
  status: string
  statusTone: BadgeTone
  testHref: string
}

export type LinksViewProps = {
  appFilter: string
  appOptions: readonly AppOptionViewModel[]
  appStatus: string | null
  error: string | null
  fallbackHostHelp: string
  form: LinkFormViewModel
  formError: string | null
  isCreateOpen: boolean
  isLoading: boolean
  isSaving: boolean
  lastCreatedLink: CreatedLinkViewModel | null
  links: readonly LinkRowViewModel[]
  nativeImportFeedback: NativeImportFeedback | null
  nativeUrl: string
  nativeScheme: string | null
  onAddParameter: () => void
  onAppChange: ChangeEventHandler<HTMLSelectElement>
  onAppFilterChange: ChangeEventHandler<HTMLSelectElement>
  onCloseCreate: () => void
  onCreate: () => void
  onDestinationChange: ChangeEventHandler<HTMLInputElement>
  onExpiresChange: ChangeEventHandler<HTMLInputElement>
  onFallbackChange: ChangeEventHandler<HTMLInputElement>
  onNameChange: ChangeEventHandler<HTMLInputElement>
  onNativeUrlChange: ChangeEventHandler<HTMLInputElement>
  onNativeUrlImport: () => void
  onNextPage: () => void
  onPreviousPage: () => void
  onRetry: () => void
  onSearchChange: ChangeEventHandler<HTMLInputElement>
  onSlugChange: ChangeEventHandler<HTMLInputElement>
  onStatusChange: ChangeEventHandler<HTMLSelectElement>
  onStatusFilterChange: ChangeEventHandler<HTMLSelectElement>
  onSubmit: FormEventHandler<HTMLFormElement>
  page: number
  search: string
  statusFilter: string
  toast: string | null
  totalLinks: number
  totalPages: number
}
