import 'server-only'

import type { Payload, PayloadRequest } from 'payload'

import type { DomainProvisioningProvider } from '@/lib/application/domain-provisioning-provider'
import type { Domain, User } from '@/payload-types'
import {
  beginDomainVerification,
  publishDomainAssociations,
  recordDomainDNSEvidence,
  recordDomainTLSReady,
} from './domain-lifecycle'
import { loadAccessibleCustomDomain, provisioningHold } from './domain-provisioning-access'
import type { DomainActionResult } from './domain-provisioning-result'
import { withLockedDomainAction } from './domain-provisioning-transaction'

const retryCooldownSeconds = 10

async function recordProviderCheck(
  payload: Payload,
  req: PayloadRequest,
  domain: Domain,
  message: string | null,
): Promise<Domain> {
  return payload.update({
    collection: 'domains',
    id: domain.id,
    data: {
      lastCheckedAt: new Date().toISOString(),
      lastVerificationError: message,
    },
    depth: 0,
    overrideAccess: true,
    req,
  })
}

const providerFailure = async (
  payload: Payload,
  req: PayloadRequest,
  domain: Domain,
  message: string,
  retryable: boolean,
): Promise<DomainActionResult> => ({
  code: 'PROVIDER_ERROR',
  domain: await recordProviderCheck(payload, req, domain, message),
  message,
  ok: false,
  retryable,
  ...(retryable ? { retryAfterSeconds: 30 } : {}),
  status: 503,
})

function cooldownResult(domain: Domain): DomainActionResult | null {
  if (!domain.lastCheckedAt) return null
  const checkedAt = new Date(domain.lastCheckedAt).getTime()
  if (!Number.isFinite(checkedAt)) return null
  const remaining = retryCooldownSeconds - Math.floor((Date.now() - checkedAt) / 1_000)
  return remaining > 0
    ? {
        code: 'RATE_LIMITED',
        domain,
        message: `Wait ${remaining} seconds before checking this hostname again.`,
        ok: false,
        retryable: true,
        retryAfterSeconds: remaining,
        status: 429,
      }
    : null
}

async function inspectAndProvision(input: {
  domain: Domain
  payload: Payload
  provider: DomainProvisioningProvider
  req: PayloadRequest
}): Promise<DomainActionResult> {
  let { domain } = input
  const cooldown = cooldownResult(domain)
  if (cooldown) return cooldown

  const dnsResult = await input.provider.inspectDNS(domain.hostname).catch(() => ({
    kind: 'error' as const,
    message: 'Domain DNS inspection is unavailable.',
    retryable: true,
  }))
  if (dnsResult.kind !== 'success') {
    return providerFailure(
      input.payload,
      input.req,
      domain,
      dnsResult.message,
      dnsResult.kind === 'error' && dnsResult.retryable,
    )
  }
  if (domain.status === 'pending-dns') {
    const begun = await beginDomainVerification(input.payload, domain.id, input.req)
    if (!begun.ok) {
      return {
        code: 'INVALID_STATE',
        domain: begun.domain,
        message: begun.message,
        ok: false,
        retryable: begun.code === 'INGRESS_NOT_CONFIGURED',
        status: begun.code === 'INGRESS_NOT_CONFIGURED' ? 503 : 409,
      }
    }
    domain = begun.domain
  }

  const evidence = await recordDomainDNSEvidence(
    input.payload,
    domain.id,
    dnsResult.value,
    input.req,
  )
  if (!evidence.ok) {
    return {
      code: 'DNS_NOT_READY',
      domain: evidence.domain,
      message: evidence.message,
      ok: false,
      retryable: true,
      retryAfterSeconds: 30,
      status: 409,
    }
  }
  domain = evidence.domain

  const certificateResult = await input.provider.requestCertificate(domain.hostname).catch(() => ({
    kind: 'error' as const,
    message: 'Certificate provisioning is unavailable.',
    retryable: true,
  }))
  if (certificateResult.kind !== 'success') {
    return providerFailure(
      input.payload,
      input.req,
      domain,
      certificateResult.message,
      certificateResult.kind === 'error' && certificateResult.retryable,
    )
  }
  if (certificateResult.value.kind === 'pending') {
    return {
      domain: await recordProviderCheck(input.payload, input.req, domain, null),
      message: 'DNS is verified. The TLS certificate is still provisioning.',
      ok: true,
      stage: 'certificate-pending',
    }
  }
  if (certificateResult.value.kind === 'failed') {
    return providerFailure(input.payload, input.req, domain, certificateResult.value.message, false)
  }

  const tls = await recordDomainTLSReady(
    input.payload,
    domain.id,
    certificateResult.value,
    input.req,
  )
  if (!tls.ok) {
    return {
      code: 'INVALID_STATE',
      domain: tls.domain,
      message: tls.message,
      ok: false,
      retryable: false,
      status: 409,
    }
  }
  const published = await publishDomainAssociations(input.payload, domain.id, input.req)
  return published.ok
    ? {
        domain: published.domain,
        message: 'DNS and TLS are ready. Confirm released app support next.',
        ok: true,
        stage: 'association-confirmation-required',
      }
    : {
        code: 'INVALID_STATE',
        domain: published.domain,
        message: published.message,
        ok: false,
        retryable: false,
        status: 409,
      }
}

async function runLocked(input: {
  domainID: string
  payload: Payload
  provider: DomainProvisioningProvider
  req: PayloadRequest
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
  if (domain.status === 'active') {
    return { domain, message: 'This custom domain is active.', ok: true, stage: 'active' }
  }
  if (domain.status === 'association-incomplete') {
    return {
      domain,
      message: 'Confirm the released mobile apps before activating this hostname.',
      ok: true,
      stage: 'association-confirmation-required',
    }
  }
  if (domain.status === 'certificate-ready') {
    const published = await publishDomainAssociations(input.payload, domain.id, input.req)
    return published.ok
      ? {
          domain: published.domain,
          message: 'Association files are ready. Confirm released app support next.',
          ok: true,
          stage: 'association-confirmation-required',
        }
      : {
          code: 'INVALID_STATE',
          domain: published.domain,
          message: published.message,
          ok: false,
          retryable: false,
          status: 409,
        }
  }
  return inspectAndProvision({ ...input, domain })
}

export function runCustomDomainProvisioning(input: {
  domainID: string
  payload: Payload
  provider: DomainProvisioningProvider
  user: User
  workspaceID: string
}): Promise<DomainActionResult> {
  return withLockedDomainAction({
    ...input,
    action: (req) => runLocked({ ...input, req }),
  })
}
