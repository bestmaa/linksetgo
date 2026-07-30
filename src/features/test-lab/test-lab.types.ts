import type { ChangeEventHandler, FormEventHandler } from 'react'

export type CheckStatus = 'passed' | 'failed' | 'pending'
export type TestPlatform = 'ios' | 'android' | 'both'

export type CheckViewModel = {
  copyAction?: {
    label: string
    onCopy: () => void
  }
  detail: string
  label: string
  remediation?: string
  status: CheckStatus
}

export type SavedLinkOptionViewModel = {
  id: string
  label: string
  url: string
}

export type TestLabViewProps = {
  checks: readonly CheckViewModel[]
  copyFeedback: string | null
  isRunning: boolean
  isSavedLinksLoading: boolean
  onCopy: () => void
  onDownloadPng: () => void
  onDownloadSvg: () => void
  onPlatformAndroid: () => void
  onPlatformBoth: () => void
  onPlatformIos: () => void
  onRun: FormEventHandler<HTMLFormElement>
  onSavedLinkChange: ChangeEventHandler<HTMLSelectElement>
  onUrlChange: ChangeEventHandler<HTMLInputElement>
  openUrl: string | null
  platform: TestPlatform
  qrDataUrl: string | null
  qrError: string | null
  runLabel: string
  savedLinkId: string
  savedLinkOptions: readonly SavedLinkOptionViewModel[]
  savedLinksError: string | null
  summary: string
  summaryDetail: string
  url: string
  urlPlaceholder: string
}
