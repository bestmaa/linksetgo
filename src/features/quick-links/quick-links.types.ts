import type { ChangeEventHandler, FormEventHandler } from 'react'

export type QuickLinkViewProps = {
  advancedOpen: boolean
  appStoreUrl: string
  error: string | null
  fallbackUrl: string
  isSaving: boolean
  name: string
  nativeUrl: string
  onAdvancedToggle: () => void
  onAppStoreUrlChange: ChangeEventHandler<HTMLInputElement>
  onCopy: () => void
  onDownloadQr: () => void
  onFallbackUrlChange: ChangeEventHandler<HTMLInputElement>
  onNameChange: ChangeEventHandler<HTMLInputElement>
  onNativeUrlChange: ChangeEventHandler<HTMLInputElement>
  onPlayStoreUrlChange: ChangeEventHandler<HTMLInputElement>
  onSubmit: FormEventHandler<HTMLFormElement>
  onUseAnother: () => void
  playStoreUrl: string
  qrDataUrl: string | null
  qrError: string | null
  result: null | {
    fallbackActionHref: string | null
    fallbackMessage: string
    name: string
    publicUrl: string
  }
  workspaceReady: boolean
}
