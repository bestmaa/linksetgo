import type { CreateAppInput } from '@/lib/client/payload-types'
import { normalizeNativeScheme } from '@/lib/domain/native-scheme'

import type {
  AppOnboardingErrors,
  AppOnboardingField,
  AppOnboardingForm,
  AppOnboardingStep,
  AppPlatform,
} from './app-onboarding.types'

export const onboardingSteps: readonly AppOnboardingStep[] = [
  'basics',
  'platforms',
  'destinations',
  'review',
]

export const emptyAppOnboardingForm: AppOnboardingForm = {
  androidPackageName: '',
  androidSha256CertFingerprints: '',
  appStoreUrl: '',
  description: '',
  fallbackUrl: '',
  iosBundleId: '',
  iosTeamId: '',
  name: '',
  nativeScheme: '',
  platform: 'both',
  playStoreUrl: '',
  slug: '',
}

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const iosBundlePattern = /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/
const iosTeamPattern = /^[A-Z0-9]{10}$/
const androidPackagePattern = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/
const sha256Pattern = /^(?:[A-Fa-f0-9]{2}:){31}[A-Fa-f0-9]{2}$/

export function slugifyAppName(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function includesIOS(platform: AppPlatform): boolean {
  return platform === 'ios' || platform === 'both'
}

export function includesAndroid(platform: AppPlatform): boolean {
  return platform === 'android' || platform === 'both'
}

function fingerprints(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function isSecureURL(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
  } catch {
    return false
  }
}

function isOfficialStoreURL(
  value: string,
  hosts: readonly string[],
  pathMatches: (pathname: string) => boolean,
): boolean {
  if (!isSecureURL(value)) return false
  const url = new URL(value)
  return hosts.includes(url.hostname.toLowerCase()) && pathMatches(url.pathname)
}

export function validateOnboardingStep(
  form: AppOnboardingForm,
  step: AppOnboardingStep,
): AppOnboardingErrors {
  const errors: AppOnboardingErrors = {}

  if (step === 'basics') {
    if (!form.name.trim()) errors.name = 'Enter the name people use for this app.'
    else if (form.name.trim().length > 120) errors.name = 'Keep the app name under 120 characters.'
    if (!form.slug.trim()) errors.slug = 'Choose a permanent app key.'
    else if (form.slug.length > 80 || !slugPattern.test(form.slug)) {
      errors.slug = 'Use up to 80 lowercase letters, numbers, and single hyphens.'
    }
    if (form.description.length > 500) {
      errors.description = 'Keep the description under 500 characters.'
    }
    if (!form.nativeScheme.trim()) {
      errors.nativeScheme = 'Enter the custom URL scheme supplied by the mobile team.'
    } else if (!normalizeNativeScheme(form.nativeScheme)) {
      errors.nativeScheme = 'Use a custom scheme such as sampleapp, without ://.'
    }
  }

  if (step === 'platforms' && includesIOS(form.platform)) {
    if (!form.iosBundleId.trim()) errors.iosBundleId = 'Enter the iOS Bundle ID.'
    else if (!iosBundlePattern.test(form.iosBundleId.trim())) {
      errors.iosBundleId = 'Use a reverse-domain ID such as com.company.app.'
    }
    if (!form.iosTeamId.trim()) errors.iosTeamId = 'Enter the 10-character Apple Team ID.'
    else if (!iosTeamPattern.test(form.iosTeamId.trim())) {
      errors.iosTeamId = 'Use the 10 uppercase letters and numbers from Apple Developer.'
    }
  }

  if (step === 'platforms' && includesAndroid(form.platform)) {
    if (!form.androidPackageName.trim()) {
      errors.androidPackageName = 'Enter the Android application ID.'
    } else if (!androidPackagePattern.test(form.androidPackageName.trim())) {
      errors.androidPackageName = 'Use a package such as com.company.app.'
    }
    const values = fingerprints(form.androidSha256CertFingerprints)
    if (values.length === 0) {
      errors.androidSha256CertFingerprints = 'Add at least one signing certificate fingerprint.'
    } else if (!values.every((value) => sha256Pattern.test(value))) {
      errors.androidSha256CertFingerprints = 'Use one colon-separated SHA-256 fingerprint per line.'
    }
  }

  if (step === 'destinations') {
    if (!form.fallbackUrl.trim()) {
      errors.fallbackUrl = 'Add the safe web page to use when the app cannot open.'
    } else if (!isSecureURL(form.fallbackUrl.trim())) {
      errors.fallbackUrl = 'Enter a complete HTTPS URL without embedded credentials.'
    }
    if (
      includesIOS(form.platform) &&
      form.appStoreUrl.trim() &&
      !isOfficialStoreURL(form.appStoreUrl.trim(), ['apps.apple.com', 'itunes.apple.com'], (path) =>
        path.includes('/app/'),
      )
    ) {
      errors.appStoreUrl = 'Enter the official HTTPS App Store listing URL.'
    }
    if (
      includesAndroid(form.platform) &&
      form.playStoreUrl.trim() &&
      !isOfficialStoreURL(form.playStoreUrl.trim(), ['play.google.com'], (path) =>
        path.startsWith('/store/apps/details'),
      )
    ) {
      errors.playStoreUrl = 'Enter the official HTTPS Google Play listing URL.'
    }
  }

  return errors
}

export function errorForField(
  form: AppOnboardingForm,
  step: AppOnboardingStep,
  field: AppOnboardingField,
): string | undefined {
  return validateOnboardingStep(form, step)[field]
}

export function buildDraftAppInput(form: AppOnboardingForm): CreateAppInput {
  const values = fingerprints(form.androidSha256CertFingerprints)
  return {
    name: form.name.trim(),
    nativeScheme: normalizeNativeScheme(form.nativeScheme) ?? '',
    slug: form.slug.trim(),
    status: 'draft',
    ...(form.description.trim() ? { description: form.description.trim() } : {}),
    ...(form.fallbackUrl.trim() ? { fallbackUrl: form.fallbackUrl.trim() } : {}),
    ...(includesIOS(form.platform)
      ? {
          iosBundleId: form.iosBundleId.trim(),
          iosTeamId: form.iosTeamId.trim(),
          ...(form.appStoreUrl.trim() ? { appStoreUrl: form.appStoreUrl.trim() } : {}),
        }
      : {}),
    ...(includesAndroid(form.platform)
      ? {
          androidPackageName: form.androidPackageName.trim(),
          androidSha256CertFingerprints: values,
          ...(form.playStoreUrl.trim() ? { playStoreUrl: form.playStoreUrl.trim() } : {}),
        }
      : {}),
  }
}
