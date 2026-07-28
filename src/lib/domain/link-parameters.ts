export type LinkParameterValue = boolean | number | string | null
export type LinkParameters = Record<string, LinkParameterValue>
const reservedParameterKeys = new Set(['__proto__', 'constructor', 'prototype'])
const controlCharacterPattern = /[\u0000-\u001F\u007F]/

export type LinkParameterParseResult =
  { ok: true; value: LinkParameters | null } | { message: string; ok: false }

export function parseLinkParameters(value: unknown): LinkParameterParseResult {
  if (value === null || value === undefined) return { ok: true, value: null }
  if (Array.isArray(value) || typeof value !== 'object') {
    return { message: 'Parameters must be a JSON object.', ok: false }
  }

  const entries = Object.entries(value)
  if (entries.length > 20) {
    return { message: 'Parameters may contain at most 20 entries.', ok: false }
  }

  let serializedSize = 0
  for (const [key, parameter] of entries) {
    if (
      !/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(key) ||
      reservedParameterKeys.has(key.toLowerCase())
    ) {
      return {
        message: 'Each parameter must use a safe key of 1-64 characters beginning with a letter.',
        ok: false,
      }
    }
    if (
      parameter !== null &&
      typeof parameter !== 'string' &&
      typeof parameter !== 'boolean' &&
      (typeof parameter !== 'number' || !Number.isFinite(parameter))
    ) {
      return {
        message: 'Parameter values must be strings, finite numbers, booleans, or null.',
        ok: false,
      }
    }
    if (
      typeof parameter === 'string' &&
      (parameter.length > 512 || controlCharacterPattern.test(parameter))
    ) {
      return {
        message:
          'Parameter string values are invalid or oversized; use safe values of at most 512 characters.',
        ok: false,
      }
    }
    serializedSize += key.length + String(parameter ?? '').length
  }

  if (serializedSize > 4_096) {
    return { message: 'Parameters exceed the 4 KB size limit.', ok: false }
  }

  return { ok: true, value: Object.fromEntries(entries) as LinkParameters }
}
