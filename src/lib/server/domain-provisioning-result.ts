import type { Domain } from '@/payload-types'

export type DomainActionStage =
  'active' | 'association-confirmation-required' | 'certificate-pending'

export type DomainActionResult =
  | {
      domain: Domain
      message: string
      ok: true
      stage: DomainActionStage
    }
  | {
      code:
        | 'DNS_NOT_READY'
        | 'FORBIDDEN'
        | 'INVALID_STATE'
        | 'NOT_FOUND'
        | 'PROVIDER_ERROR'
        | 'RATE_LIMITED'
        | 'RELEASE_NOT_READY'
        | 'UNAVAILABLE'
      domain?: Domain
      message: string
      ok: false
      retryable: boolean
      retryAfterSeconds?: number
      status: 403 | 404 | 409 | 429 | 503
    }

export const unavailableDomainAction = (): DomainActionResult => ({
  code: 'UNAVAILABLE',
  message: 'Relay could not complete this domain operation safely. Try again shortly.',
  ok: false,
  retryable: true,
  retryAfterSeconds: 30,
  status: 503,
})
