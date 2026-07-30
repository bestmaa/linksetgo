import { hasCompleteAppPlatform } from '@/lib/domain/app-readiness'
import type { AppConsoleConfigurationInput } from '@/lib/client/payload-types'
import { normalizeNativeScheme } from '@/lib/domain/native-scheme'

import type { AppDetailForm, AppDetailFormErrors } from './app-detail.types'

const iosBundlePattern = /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/
const iosTeamPattern = /^[A-Z0-9]{10}$/
const androidPackagePattern = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/
const sha256Pattern = /^(?:[A-Fa-f0-9]{2}:){31}[A-Fa-f0-9]{2}$/

export const emptyAppDetailForm: AppDetailForm = {
  androidPackageName: '',
  androidSha256CertFingerprints: '',
  appStoreUrl: '',
  description: '',
  fallbackUrl: '',
  iosBundleId: '',
  iosTeamId: '',
  name: '',
  nativeScheme: '',
  playStoreUrl: '',
}

export function appDetailFingerprints(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean)
}

function secureURL(value: string): URL | null {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password ? url : null
  } catch {
    return null
  }
}

function officialURL(
  value: string,
  hosts: readonly string[],
  matchesPath: (path: string) => boolean,
): boolean {
  const url = secureURL(value)
  return Boolean(url && hosts.includes(url.hostname.toLowerCase()) && matchesPath(url.pathname))
}

export function configurationFromAppDetailForm(form: AppDetailForm): AppConsoleConfigurationInput {
  return {
    androidPackageName: form.androidPackageName.trim(),
    androidSha256CertFingerprints: appDetailFingerprints(form.androidSha256CertFingerprints),
    appStoreUrl: form.appStoreUrl.trim(),
    description: form.description.trim(),
    fallbackUrl: form.fallbackUrl.trim(),
    iosBundleId: form.iosBundleId.trim(),
    iosTeamId: form.iosTeamId.trim().toUpperCase(),
    name: form.name.trim(),
    nativeScheme: normalizeNativeScheme(form.nativeScheme) ?? '',
    playStoreUrl: form.playStoreUrl.trim(),
  }
}

export function validateAppDetailForm(
  form: AppDetailForm,
  active: boolean,
): { errors: AppDetailFormErrors; message: string | null } {
  const errors: AppDetailFormErrors = {}
  const fingerprints = appDetailFingerprints(form.androidSha256CertFingerprints)

  if (!form.name.trim()) errors.name = 'Enter the app name.'
  else if (form.name.trim().length > 120) errors.name = 'Keep the name under 120 characters.'
  if (form.description.length > 500) {
    errors.description = 'Keep the description under 500 characters.'
  }
  if (form.nativeScheme.trim() && !normalizeNativeScheme(form.nativeScheme)) {
    errors.nativeScheme = 'Use a custom scheme such as sampleapp, without ://.'
  }
  if (form.iosBundleId.trim() && !iosBundlePattern.test(form.iosBundleId.trim())) {
    errors.iosBundleId = 'Use a reverse-domain bundle identifier.'
  }
  if (form.iosTeamId.trim() && !iosTeamPattern.test(form.iosTeamId.trim().toUpperCase())) {
    errors.iosTeamId = 'Use the 10-character Apple Team ID.'
  }
  if (
    form.androidPackageName.trim() &&
    !androidPackagePattern.test(form.androidPackageName.trim())
  ) {
    errors.androidPackageName = 'Use an Android package such as com.company.app.'
  }
  if (fingerprints.some((value) => !sha256Pattern.test(value))) {
    errors.androidSha256CertFingerprints = 'Use one colon-separated SHA-256 fingerprint per line.'
  }
  if (form.fallbackUrl.trim() && !secureURL(form.fallbackUrl.trim())) {
    errors.fallbackUrl = 'Enter a complete HTTPS fallback URL.'
  }
  if (
    form.appStoreUrl.trim() &&
    !officialURL(form.appStoreUrl.trim(), ['apps.apple.com', 'itunes.apple.com'], (path) =>
      path.includes('/app/'),
    )
  ) {
    errors.appStoreUrl = 'Enter an official App Store listing URL.'
  }
  if (
    form.playStoreUrl.trim() &&
    !officialURL(form.playStoreUrl.trim(), ['play.google.com'], (path) =>
      path.startsWith('/store/apps/details'),
    )
  ) {
    errors.playStoreUrl = 'Enter an official Google Play listing URL.'
  }

  const configuration = configurationFromAppDetailForm(form)
  const message =
    active && !hasCompleteAppPlatform(configuration)
      ? 'An active app must keep at least one complete platform configuration.'
      : null
  return { errors, message }
}
