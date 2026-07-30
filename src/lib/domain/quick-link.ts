import { canonicalizeFallbackURL } from './fallback-url-safety'
import { parseNativeDeepLink } from './native-deep-link'

export const MAX_QUICK_LINK_BODY_BYTES = 16 * 1024

export type QuickLinkInput = {
  appStoreUrl: null | string
  fallbackUrl: null | string
  name: null | string
  nativeUrl: string
  playStoreUrl: null | string
  workspaceId: string
}

export type QuickLinkValidation =
  | { ok: true; value: QuickLinkInput }
  | { field: keyof QuickLinkInput | 'form'; message: string; ok: false }

const allowedFields = new Set([
  'appStoreUrl',
  'fallbackUrl',
  'name',
  'nativeUrl',
  'playStoreUrl',
  'workspaceId',
])
const identifierPattern = /^[A-Za-z0-9_-]{1,128}$/

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const optionalText = (
  value: unknown,
  maximumLength: number,
): { ok: true; value: null | string } | { ok: false } => {
  if (value === null || value === undefined || value === '') return { ok: true, value: null }
  if (typeof value !== 'string') return { ok: false }
  const trimmed = value.trim()
  return trimmed && trimmed.length <= maximumLength ? { ok: true, value: trimmed } : { ok: false }
}

const officialStoreURL = (
  value: unknown,
  kind: 'apple' | 'google',
): { ok: true; value: null | string } | { ok: false } => {
  const text = optionalText(value, 2_048)
  if (!text.ok || !text.value) return text
  try {
    const url = new URL(text.value)
    const valid =
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      (kind === 'apple'
        ? ['apps.apple.com', 'itunes.apple.com'].includes(url.hostname.toLowerCase()) &&
          url.pathname.includes('/app/')
        : url.hostname.toLowerCase() === 'play.google.com' &&
          url.pathname.startsWith('/store/apps/details'))
    return valid ? { ok: true, value: url.toString() } : { ok: false }
  } catch {
    return { ok: false }
  }
}

export function parseQuickLinkInput(value: unknown): QuickLinkValidation {
  if (!isRecord(value) || Object.keys(value).some((field) => !allowedFields.has(field))) {
    return { field: 'form', message: 'Enter one mobile app URL.', ok: false }
  }

  const workspaceId = typeof value.workspaceId === 'string' ? value.workspaceId.trim() : ''
  if (!identifierPattern.test(workspaceId)) {
    return { field: 'workspaceId', message: 'Select a workspace.', ok: false }
  }

  const nativeUrl = typeof value.nativeUrl === 'string' ? value.nativeUrl.trim() : ''
  const parsedNativeURL = parseNativeDeepLink(nativeUrl)
  if (!parsedNativeURL.ok) {
    return { field: 'nativeUrl', message: parsedNativeURL.message, ok: false }
  }

  const name = optionalText(value.name, 160)
  if (!name.ok) {
    return {
      field: 'name',
      message: 'Keep the optional link name under 160 characters.',
      ok: false,
    }
  }

  const fallbackText = optionalText(value.fallbackUrl, 2_048)
  if (!fallbackText.ok) {
    return { field: 'fallbackUrl', message: 'Enter one HTTPS fallback URL.', ok: false }
  }
  if (fallbackText.value) {
    const fallback = canonicalizeFallbackURL(fallbackText.value)
    if (!fallback.ok) {
      return { field: 'fallbackUrl', message: fallback.message, ok: false }
    }
    fallbackText.value = fallback.value.canonicalUrl
  }

  const appStoreUrl = officialStoreURL(value.appStoreUrl, 'apple')
  if (!appStoreUrl.ok) {
    return {
      field: 'appStoreUrl',
      message: 'Enter an official Apple App Store URL.',
      ok: false,
    }
  }
  const playStoreUrl = officialStoreURL(value.playStoreUrl, 'google')
  if (!playStoreUrl.ok) {
    return {
      field: 'playStoreUrl',
      message: 'Enter an official Google Play URL.',
      ok: false,
    }
  }

  return {
    ok: true,
    value: {
      appStoreUrl: appStoreUrl.value,
      fallbackUrl: fallbackText.value,
      name: name.value,
      nativeUrl,
      playStoreUrl: playStoreUrl.value,
      workspaceId,
    },
  }
}
