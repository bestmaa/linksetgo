import { appDestinationPathError } from '@/lib/domain/app-route'
import { parseLinkParameters } from '@/lib/domain/link-parameters'
import { normalizeNativeScheme } from '@/lib/domain/native-scheme'

export type NativeLinkParameter = {
  key: string
  value: string
}

export type NativeLinkParseResult =
  | {
      ok: true
      destinationPath: string
      parameters: readonly NativeLinkParameter[]
      scheme: string
    }
  | {
      ok: false
      message: string
    }

const nativeURLPattern = /^([A-Za-z][A-Za-z0-9+.-]*):\/\/([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/
const browserSchemes = new Set(['data', 'file', 'http', 'https', 'javascript', 'mailto', 'tel'])
const controlCharacterPattern = /[\u0000-\u001F\u007F]/
const malformedPercentPattern = /%(?![0-9A-Fa-f]{2})/

export function parseNativeDeepLink(
  rawValue: string,
  expectedScheme?: string | null,
): NativeLinkParseResult {
  const value = rawValue.trim()
  if (!value) return { ok: false, message: 'Paste a custom-scheme URL first.' }
  if (value.length > 4096) {
    return { ok: false, message: 'The native URL is too long. Keep it under 4,096 characters.' }
  }
  if (controlCharacterPattern.test(value) || malformedPercentPattern.test(value)) {
    return { ok: false, message: 'The native URL contains invalid characters or encoding.' }
  }

  const match = nativeURLPattern.exec(value)
  if (!match) {
    return {
      ok: false,
      message:
        'Use a complete custom-scheme URL, for example sampleapp://membership-detail?level=gold.',
    }
  }

  const scheme = match[1]!.toLowerCase()
  if (browserSchemes.has(scheme) || !normalizeNativeScheme(scheme)) {
    return {
      ok: false,
      message: 'Use the mobile app custom scheme, not an HTTP, browser, or system URL.',
    }
  }
  const normalizedExpectedScheme =
    expectedScheme === null || expectedScheme === undefined
      ? null
      : normalizeNativeScheme(expectedScheme)
  if (expectedScheme !== null && expectedScheme !== undefined && !normalizedExpectedScheme) {
    return {
      ok: false,
      message: 'Configure a valid native URL scheme on the selected app before importing routes.',
    }
  }
  if (normalizedExpectedScheme && scheme !== normalizedExpectedScheme) {
    return {
      ok: false,
      message: `This URL uses ${scheme}://, but the selected app expects ${normalizedExpectedScheme}://.`,
    }
  }
  if (match[4] !== undefined) {
    return {
      ok: false,
      message: 'Fragments (#...) are not supported. Send the value as a query parameter instead.',
    }
  }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return { ok: false, message: 'Enter a valid custom-scheme URL.' }
  }
  if (url.username || url.password || url.port) {
    return { ok: false, message: 'Credentials and ports are not valid app routes.' }
  }

  const destinationPath = `/${match[2]!.replace(/^\/+/, '')}`
  const destinationError = appDestinationPathError(destinationPath)
  if (destinationError) return { ok: false, message: destinationError }

  const parameters: NativeLinkParameter[] = []
  const seenKeys = new Set<string>()
  for (const [key, parameterValue] of url.searchParams) {
    if (parameters.length >= 20) {
      return { ok: false, message: 'A native URL can import at most 20 parameters.' }
    }
    if (seenKeys.has(key)) {
      return {
        ok: false,
        message: `Parameter "${key}" appears more than once. Use one scalar value per key.`,
      }
    }
    seenKeys.add(key)
    parameters.push({ key, value: parameterValue })
  }
  const parsedParameters = parseLinkParameters(
    Object.fromEntries(parameters.map(({ key, value }) => [key, value])),
  )
  if (!parsedParameters.ok) return { ok: false, message: parsedParameters.message }

  return { destinationPath, ok: true, parameters, scheme }
}
