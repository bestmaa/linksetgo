import { normalizeHostname } from './workspace-domain'

export type RequestHostResult =
  | {
      ok: true
      hostname: string
      source: 'forwarded-host' | 'host'
    }
  | {
      ok: false
      reason: 'INVALID_FORWARDED_HOST' | 'INVALID_HOST' | 'MISSING_HOST'
    }

const authorityHostname = (value: string | null): string | null => {
  if (!value) return null

  const authority = value.trim()
  if (!authority || /[\s,/@?#\\]/.test(authority)) return null

  const bracketedIPv6 = /^\[([0-9a-f:.]+)\](?::([0-9]{1,5}))?$/i.exec(authority)
  if (bracketedIPv6) {
    const port = bracketedIPv6[2] ? Number(bracketedIPv6[2]) : null
    if (port !== null && (port < 1 || port > 65_535)) return null
    return `[${bracketedIPv6[1]!.toLowerCase()}]`
  }

  const hostWithOptionalPort = /^([^:]+)(?::([0-9]{1,5}))?$/.exec(authority)
  if (!hostWithOptionalPort) return null

  const port = hostWithOptionalPort[2] ? Number(hostWithOptionalPort[2]) : null
  if (port !== null && (port < 1 || port > 65_535)) return null
  return normalizeHostname(hostWithOptionalPort[1])
}

export function requestHostname(
  headers: Pick<Headers, 'get'>,
  trustForwardedHost: boolean,
): RequestHostResult {
  const forwardedHost = headers.get('x-forwarded-host')
  if (trustForwardedHost && forwardedHost !== null) {
    const hostname = authorityHostname(forwardedHost)
    return hostname
      ? { ok: true, hostname, source: 'forwarded-host' }
      : { ok: false, reason: 'INVALID_FORWARDED_HOST' }
  }

  const host = headers.get('host')
  if (host === null) return { ok: false, reason: 'MISSING_HOST' }

  const hostname = authorityHostname(host)
  return hostname ? { ok: true, hostname, source: 'host' } : { ok: false, reason: 'INVALID_HOST' }
}

export function hostnameFromBaseURL(baseURL: string): string | null {
  try {
    const hostname = new URL(baseURL).hostname
    if (hostname === '::1' || hostname === '[::1]') return '[::1]'
    return normalizeHostname(hostname)
  } catch {
    return null
  }
}
