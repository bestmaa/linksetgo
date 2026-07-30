import 'server-only'

import { createHmac } from 'node:crypto'
import { isIP } from 'node:net'

export function privacySafeHash(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value.slice(0, 4_096)).digest('hex')
}

export function canonicalTrustedClientIPAddress(
  request: Request,
  trustProxyClientIPHeader: boolean,
): string | null {
  if (!trustProxyClientIPHeader) return null
  return (
    [request.headers.get('x-real-ip'), request.headers.get('x-forwarded-for')]
      .map((value) => value?.trim())
      .find(
        (value): value is string =>
          typeof value === 'string' && !value.includes(',') && isIP(value) > 0,
      ) ?? null
  )
}

export function privacySafeRequestKey(input: {
  request: Request
  secret: string
  trustProxyClientIPHeader: boolean
}): string {
  const trustedIP = canonicalTrustedClientIPAddress(input.request, input.trustProxyClientIPHeader)
  // Never let attacker-controlled browser headers manufacture identities.
  // Cloud public auth requires a trusted ingress; other deployments share this
  // deliberately restrictive installation bucket until one is configured.
  return privacySafeHash(trustedIP ?? 'untrusted-ingress-client', input.secret)
}
