export type AppReadinessInput = {
  androidPackageName?: string | null
  androidSha256CertFingerprints?: readonly string[] | null
  iosBundleId?: string | null
  iosTeamId?: string | null
}

export type AppPlatformReadiness = {
  android: {
    complete: boolean
    missing: readonly ('androidPackageName' | 'androidSha256CertFingerprints')[]
  }
  ios: {
    complete: boolean
    missing: readonly ('iosBundleId' | 'iosTeamId')[]
  }
}

const hasText = (value: string | null | undefined): boolean => Boolean(value?.trim())

export function appPlatformReadiness(input: AppReadinessInput): AppPlatformReadiness {
  const iosMissing: ('iosBundleId' | 'iosTeamId')[] = []
  if (!hasText(input.iosBundleId)) iosMissing.push('iosBundleId')
  if (!hasText(input.iosTeamId)) iosMissing.push('iosTeamId')

  const androidMissing: ('androidPackageName' | 'androidSha256CertFingerprints')[] = []
  if (!hasText(input.androidPackageName)) androidMissing.push('androidPackageName')
  if (!input.androidSha256CertFingerprints?.some(hasText)) {
    androidMissing.push('androidSha256CertFingerprints')
  }

  return {
    android: { complete: androidMissing.length === 0, missing: androidMissing },
    ios: { complete: iosMissing.length === 0, missing: iosMissing },
  }
}

export function hasCompleteAppPlatform(input: AppReadinessInput): boolean {
  const readiness = appPlatformReadiness(input)
  return readiness.ios.complete || readiness.android.complete
}
