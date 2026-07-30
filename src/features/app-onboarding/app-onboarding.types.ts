import type { FormEventHandler } from 'react'

export type AppPlatform = 'android' | 'both' | 'ios'
export type AppOnboardingStep = 'basics' | 'destinations' | 'platforms' | 'review'

export type AppOnboardingForm = {
  androidPackageName: string
  androidSha256CertFingerprints: string
  appStoreUrl: string
  description: string
  fallbackUrl: string
  iosBundleId: string
  iosTeamId: string
  name: string
  nativeScheme: string
  platform: AppPlatform
  playStoreUrl: string
  slug: string
}

export type AppOnboardingField = Exclude<keyof AppOnboardingForm, 'platform'>
export type AppOnboardingErrors = Partial<Record<AppOnboardingField, string>>

export type AppOnboardingStepItem = {
  canVisit: boolean
  id: AppOnboardingStep
  label: string
  number: number
  state: 'complete' | 'current' | 'upcoming'
}

export type CreatedAppViewModel = {
  id: string
  name: string
  platformLabel: string
  slug: string
}

export type AppOnboardingViewProps = {
  createdApp: CreatedAppViewModel | null
  errors: AppOnboardingErrors
  form: AppOnboardingForm
  isSaving: boolean
  onBack: () => void
  onBackToApps: () => void
  onCancel: () => void
  onCreateLink: () => void
  onFieldBlur: (field: AppOnboardingField) => void
  onFieldChange: (field: AppOnboardingField, value: string) => void
  onNext: () => void
  onOpenDraft: () => void
  onPlatformChange: (platform: AppPlatform) => void
  onStepSelect: (step: AppOnboardingStep) => void
  onSubmit: FormEventHandler<HTMLFormElement>
  publicUrlPreview: string
  step: AppOnboardingStep
  steps: readonly AppOnboardingStepItem[]
  submitError: string | null
  workspaceName: string | null
}
