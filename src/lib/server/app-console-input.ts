import 'server-only'

import type { User } from '@/payload-types'
import type {
  AppConsoleConfigurationInput,
  AppConsoleMutationInput,
} from '@/lib/client/payload-types'

type ParseResult = { message: string; ok: false } | { ok: true; value: AppConsoleMutationInput }

const identifierPattern = /^[A-Za-z0-9_-]{1,128}$/
const configurationKeys = new Set<keyof AppConsoleConfigurationInput>([
  'androidPackageName',
  'androidSha256CertFingerprints',
  'appStoreUrl',
  'description',
  'fallbackUrl',
  'iosBundleId',
  'iosTeamId',
  'name',
  'nativeScheme',
  'playStoreUrl',
])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export function normalizeConsoleAppIdentifier(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const identifier = value.trim()
  return identifierPattern.test(identifier) ? identifier : null
}

export function isActiveAppConsoleUser(value: unknown): value is User {
  if (!isRecord(value)) return false
  return (typeof value.id === 'string' || typeof value.id === 'number') && value.status === 'active'
}

function readString(
  input: Record<string, unknown>,
  key: Exclude<keyof AppConsoleConfigurationInput, 'androidSha256CertFingerprints'>,
  maximumLength: number,
): string | null {
  const value = input[key]
  return typeof value === 'string' && value.length <= maximumLength ? value : null
}

function parseConfiguration(value: unknown): AppConsoleConfigurationInput | null {
  if (!isRecord(value)) return null
  if (
    Object.keys(value).some(
      (key) => !configurationKeys.has(key as keyof AppConsoleConfigurationInput),
    )
  ) {
    return null
  }

  const androidPackageName = readString(value, 'androidPackageName', 240)
  const appStoreUrl = readString(value, 'appStoreUrl', 2048)
  const description = readString(value, 'description', 500)
  const fallbackUrl = readString(value, 'fallbackUrl', 2048)
  const iosBundleId = readString(value, 'iosBundleId', 240)
  const iosTeamId = readString(value, 'iosTeamId', 10)
  const name = readString(value, 'name', 120)
  const nativeScheme = readString(value, 'nativeScheme', 64)
  const playStoreUrl = readString(value, 'playStoreUrl', 2048)
  const fingerprints = value.androidSha256CertFingerprints

  if (
    androidPackageName === null ||
    appStoreUrl === null ||
    description === null ||
    fallbackUrl === null ||
    iosBundleId === null ||
    iosTeamId === null ||
    name === null ||
    nativeScheme === null ||
    playStoreUrl === null ||
    !Array.isArray(fingerprints) ||
    fingerprints.length > 20 ||
    !fingerprints.every((item) => typeof item === 'string' && item.length <= 95) ||
    !name.trim()
  ) {
    return null
  }

  return {
    androidPackageName,
    androidSha256CertFingerprints: fingerprints,
    appStoreUrl,
    description,
    fallbackUrl,
    iosBundleId,
    iosTeamId,
    name,
    nativeScheme,
    playStoreUrl,
  }
}

export function parseAppConsoleMutation(value: unknown): ParseResult {
  if (!isRecord(value)) return { message: 'Enter a valid app update.', ok: false }
  const workspaceId = normalizeConsoleAppIdentifier(value.workspaceId)
  const action = value.action
  if (!workspaceId || (action !== 'save' && action !== 'activate' && action !== 'pause')) {
    return { message: 'Select a workspace and valid app action.', ok: false }
  }

  const allowedKeys =
    action === 'save'
      ? new Set(['action', 'configuration', 'workspaceId'])
      : new Set(['action', 'workspaceId'])
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    return {
      message: 'The permanent app key and workspace cannot be changed here.',
      ok: false,
    }
  }

  if (action === 'save') {
    const configuration = parseConfiguration(value.configuration)
    return configuration
      ? { ok: true, value: { action, configuration, workspaceId } }
      : { message: 'Review the app configuration fields and try again.', ok: false }
  }

  return { ok: true, value: { action, workspaceId } }
}
