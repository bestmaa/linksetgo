import 'server-only'

import type { Payload, PayloadRequest } from 'payload'

import { normalizeHostname } from '@/lib/domain/workspace-domain'
import type { User } from '@/payload-types'
import { activateDomain } from './domain-lifecycle'
import {
  canConfirmDomainRelease,
  loadAccessibleCustomDomain,
  provisioningHold,
} from './domain-provisioning-access'
import type { DomainActionResult } from './domain-provisioning-result'
import { withLockedDomainAction } from './domain-provisioning-transaction'

async function confirmLocked(input: {
  confirmedHostname: string
  domainID: string
  payload: Payload
  req: PayloadRequest
  user: User
  workspaceID: string
}): Promise<DomainActionResult> {
  const domain = await loadAccessibleCustomDomain(input)
  if (!domain) {
    return {
      code: 'NOT_FOUND',
      message: 'This custom domain is not available in the selected workspace.',
      ok: false,
      retryable: false,
      status: 404,
    }
  }
  const hold = await provisioningHold({ domain, payload: input.payload, req: input.req })
  if (hold) return hold
  if (normalizeHostname(input.confirmedHostname) !== domain.hostname) {
    return {
      code: 'RELEASE_NOT_READY',
      domain,
      message: 'Type the exact hostname before confirming a released mobile build.',
      ok: false,
      retryable: false,
      status: 409,
    }
  }
  if (domain.status === 'active') {
    return { domain, message: 'This custom domain is active.', ok: true, stage: 'active' }
  }
  if (domain.status !== 'association-incomplete') {
    return {
      code: 'INVALID_STATE',
      domain,
      message: 'DNS, TLS, and association publishing must finish before confirmation.',
      ok: false,
      retryable: false,
      status: 409,
    }
  }

  const releaseBlock = await canConfirmDomainRelease({ ...input, domain })
  if (releaseBlock) return releaseBlock
  const activated = await activateDomain(input.payload, domain.id, input.req)
  return activated.ok
    ? {
        domain: activated.domain,
        message: 'Custom domain activated. Existing managed links remain available.',
        ok: true,
        stage: 'active',
      }
    : {
        code: 'INVALID_STATE',
        domain: activated.domain,
        message: activated.message,
        ok: false,
        retryable: false,
        status: 409,
      }
}

export function confirmCustomDomainRelease(input: {
  confirmedHostname: string
  domainID: string
  payload: Payload
  user: User
  workspaceID: string
}): Promise<DomainActionResult> {
  return withLockedDomainAction({
    ...input,
    action: (req) => confirmLocked({ ...input, req }),
  })
}
