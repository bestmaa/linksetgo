import { isSafeAppDestinationPath } from './app-route'
import { parseLinkParameters, type LinkParameters } from './link-parameters'

const schemePattern = /^[a-z][a-z0-9+.-]{1,63}$/

const reservedSchemes = new Set([
  'about',
  'blob',
  'chrome',
  'chrome-extension',
  'data',
  'file',
  'ftp',
  'http',
  'https',
  'intent',
  'javascript',
  'mailto',
  'market',
  'sms',
  'tel',
])

export function normalizeNativeScheme(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/:\/\/$/, '')
  if (!schemePattern.test(normalized) || reservedSchemes.has(normalized)) return null
  return normalized
}

export function validateNativeSchemeValue(value: unknown): true | string {
  if (value === null || value === undefined || value === '') return true
  return normalizeNativeScheme(value) === value
    ? true
    : 'Use 2–64 lowercase scheme characters (for example, sampleapp) without ://.'
}

export function nativeSchemeURL(scheme: string, destinationPath: string): string | null {
  return nativeDeepLinkURL({ destinationPath, parameters: null, scheme })
}

export function nativeDeepLinkURL(input: {
  destinationPath: string
  parameters: LinkParameters | null
  scheme: string
}): string | null {
  const normalized = normalizeNativeScheme(input.scheme)
  const parameters = parseLinkParameters(input.parameters)
  if (!normalized || !isSafeAppDestinationPath(input.destinationPath) || !parameters.ok) {
    return null
  }
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(parameters.value ?? {})) {
    query.set(key, value === null ? '' : String(value))
  }
  const serialized = query.toString()
  return `${normalized}://${input.destinationPath.slice(1)}${serialized ? `?${serialized}` : ''}`
}
