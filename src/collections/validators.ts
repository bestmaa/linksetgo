import type { JSONFieldValidation, TextFieldManyValidation, TextFieldValidation } from 'payload'

import { parseLinkParameters } from '@/lib/domain/link-parameters'
import { validateNativeSchemeValue } from '@/lib/domain/native-scheme'
import { appDestinationPathError } from '@/lib/domain/app-route'
import { canonicalizeFallbackURL } from '@/lib/domain/fallback-url-safety'

import { normalizeHostname } from '@/lib/domain/workspace-domain'

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const IOS_BUNDLE_PATTERN = /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/
const IOS_TEAM_PATTERN = /^[A-Z0-9]{10}$/
const ANDROID_PACKAGE_PATTERN = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/
const SHA256_PATTERN = /^(?:[A-Fa-f0-9]{2}:){31}[A-Fa-f0-9]{2}$/
const HOST_PATTERN =
  /^(?:localhost|(?:\d{1,3}\.){3}\d{1,3}|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)$/i

export const normalizeSlug = (value: unknown): unknown =>
  typeof value === 'string'
    ? value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
    : value

export const validateSlug: TextFieldValidation = (value) =>
  !value || SLUG_PATTERN.test(value)
    ? true
    : 'Use lowercase letters, numbers, and single hyphens only.'

export const validateNativeScheme: TextFieldValidation = (value) => validateNativeSchemeValue(value)

export const validateHttpsURL: TextFieldValidation = (value) => {
  if (!value) return true
  const result = canonicalizeFallbackURL(value)
  return result.ok ? true : result.message
}

export const validateAppStoreURL: TextFieldValidation = (value) =>
  validateOfficialStoreURL(value, {
    hosts: ['apps.apple.com', 'itunes.apple.com'],
    isValidPath: (pathname) => pathname.includes('/app/'),
    label: 'Apple App Store',
  })

export const validatePlayStoreURL: TextFieldValidation = (value) =>
  validateOfficialStoreURL(value, {
    hosts: ['play.google.com'],
    isValidPath: (pathname) => pathname.startsWith('/store/apps/details'),
    label: 'Google Play',
  })

export const validateDestinationPath: TextFieldValidation = (value) => {
  if (!value) return true
  return appDestinationPathError(value) ?? true
}

export const validateIOSBundleID: TextFieldValidation = (value) =>
  !value || IOS_BUNDLE_PATTERN.test(value) ? true : 'Enter a valid iOS bundle identifier.'

export const validateIOSTeamID: TextFieldValidation = (value) =>
  !value || IOS_TEAM_PATTERN.test(value) ? true : 'Apple Team ID must be 10 characters.'

export const validateAndroidPackage: TextFieldValidation = (value) =>
  !value || ANDROID_PACKAGE_PATTERN.test(value) ? true : 'Enter a valid Android package name.'

export const validateFingerprints: TextFieldManyValidation = (values) =>
  !values || values.every((value) => SHA256_PATTERN.test(value))
    ? true
    : 'Each fingerprint must be a colon-separated SHA-256 value.'

export const validateAllowedHosts: TextFieldManyValidation = (values) =>
  !values || values.every((value) => HOST_PATTERN.test(value))
    ? true
    : 'Enter hostnames only, without a scheme, path, port, or wildcard.'

export const validateHostname: TextFieldValidation = (value) =>
  !value || normalizeHostname(value) === value
    ? true
    : 'Enter one normalized hostname without a scheme, path, port, or wildcard.'

export const validateParameters: JSONFieldValidation = (value) => {
  const result = parseLinkParameters(value)
  return result.ok ? true : result.message
}

function validateOfficialStoreURL(
  value: string | null | undefined,
  options: { hosts: readonly string[]; isValidPath: (pathname: string) => boolean; label: string },
): true | string {
  if (!value) return true

  try {
    const url = new URL(value)
    const isAllowed =
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      options.hosts.includes(url.hostname.toLowerCase()) &&
      options.isValidPath(url.pathname)

    return isAllowed ? true : `Enter an official ${options.label} HTTPS URL.`
  } catch {
    return `Enter an official ${options.label} HTTPS URL.`
  }
}
