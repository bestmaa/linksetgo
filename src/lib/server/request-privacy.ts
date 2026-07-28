import 'server-only'

import { createHmac } from 'node:crypto'
import { isIP } from 'node:net'

export function privacySafeHash(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value.slice(0, 4_096)).digest('hex')
}

export function privacySafeRequestKey(input: {
  request: Request
  secret: string
  trustProxyClientIPHeader: boolean
}): string {
  const trustedIP = input.trustProxyClientIPHeader
    ? [input.request.headers.get('x-forwarded-for'), input.request.headers.get('x-real-ip')]
        .map((value) => value?.trim())
        .find(
          (value): value is string =>
            typeof value === 'string' && !value.includes(',') && isIP(value) > 0,
        )
    : undefined
  const fallbackIdentity = `${input.request.headers.get('user-agent') ?? 'unknown'}:${
    input.request.headers.get('accept-language') ?? 'unknown'
  }`

  return privacySafeHash(trustedIP ?? fallbackIdentity, input.secret)
}
