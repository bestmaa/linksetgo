const controlCharacterPattern = /[\u0000-\u001F\u007F]/

export function appDestinationPathError(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return 'Destination must be an app path beginning with exactly one slash.'
  }
  if (value.length < 2 || value.length > 2048) {
    return 'Destination must contain a non-empty path and stay under 2,048 characters.'
  }
  if (
    value.includes('\\') ||
    value.includes('//') ||
    value.includes('?') ||
    value.includes('#') ||
    /\s/.test(value) ||
    controlCharacterPattern.test(value)
  ) {
    return 'Destination contains an unsafe separator, query, fragment, or whitespace.'
  }

  for (const segment of value.slice(1).split('/')) {
    if (!segment) return 'Destination cannot contain an empty path segment.'
    let decoded: string
    try {
      decoded = decodeURIComponent(segment)
    } catch {
      return 'Destination contains invalid percent encoding.'
    }
    if (
      decoded === '.' ||
      decoded === '..' ||
      decoded.includes('/') ||
      decoded.includes('\\') ||
      decoded.includes('?') ||
      decoded.includes('#') ||
      /\s/.test(decoded) ||
      controlCharacterPattern.test(decoded)
    ) {
      return 'Destination contains an unsafe path segment or encoded separator.'
    }
  }
  return null
}

export function isSafeAppDestinationPath(value: unknown): value is string {
  return appDestinationPathError(value) === null
}
