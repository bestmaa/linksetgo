import 'server-only'

import type { Payload, PayloadRequest } from 'payload'

import {
  buildDomainVerificationInstructions,
  evaluateDomainDNSEvidence,
  type DomainDNSEvidence,
  type DomainVerificationInstructions,
} from '@/lib/domain/domain-verification'
import type { Domain } from '@/payload-types'
import { getServerEnvironment } from './env'

type DomainIdentifier = number | string

export type DomainLifecycleResult =
  | { ok: true; domain: Domain }
  | {
      ok: false
      code: 'DNS_EVIDENCE_REJECTED' | 'INGRESS_NOT_CONFIGURED' | 'INVALID_STATE'
      message: string
      domain: Domain
    }

const loadDomain = (
  payload: Payload,
  id: DomainIdentifier,
  req?: PayloadRequest,
): Promise<Domain> =>
  payload.findByID({
    collection: 'domains',
    id,
    depth: 0,
    overrideAccess: true,
    ...(req ? { req } : {}),
  })

const updateDomain = (
  payload: Payload,
  id: DomainIdentifier,
  data: Partial<Domain>,
  req?: PayloadRequest,
): Promise<Domain> =>
  payload.update({
    collection: 'domains',
    id,
    depth: 0,
    overrideAccess: true,
    data,
    ...(req ? { req } : {}),
  })

export function domainVerificationInstructions(
  domain: Pick<Domain, 'hostname' | 'verificationToken'>,
): DomainVerificationInstructions | null {
  const ingressTarget = getServerEnvironment().managedIngressCnameTarget
  if (!ingressTarget) return null

  return buildDomainVerificationInstructions({
    hostname: domain.hostname,
    ingressCnameTarget: ingressTarget,
    verificationToken: domain.verificationToken,
  })
}

export async function beginDomainVerification(
  payload: Payload,
  id: DomainIdentifier,
  req?: PayloadRequest,
): Promise<DomainLifecycleResult> {
  const domain = await loadDomain(payload, id, req)
  if (domain.status !== 'pending-dns') {
    return {
      ok: false,
      code: 'INVALID_STATE',
      message: 'Domain verification can begin only from pending-dns.',
      domain,
    }
  }

  if (!domainVerificationInstructions(domain)) {
    return {
      ok: false,
      code: 'INGRESS_NOT_CONFIGURED',
      message: 'The Relay ingress CNAME target is not configured.',
      domain,
    }
  }

  return {
    ok: true,
    domain: await updateDomain(
      payload,
      id,
      {
        lastCheckedAt: new Date().toISOString(),
        lastVerificationError: null,
        status: 'verifying',
      },
      req,
    ),
  }
}

export async function recordDomainDNSEvidence(
  payload: Payload,
  id: DomainIdentifier,
  evidence: DomainDNSEvidence,
  req?: PayloadRequest,
): Promise<DomainLifecycleResult> {
  const domain = await loadDomain(payload, id, req)
  if (domain.status !== 'verifying') {
    return {
      ok: false,
      code: 'INVALID_STATE',
      message: 'DNS evidence is accepted only while the domain is verifying.',
      domain,
    }
  }

  const instructions = domainVerificationInstructions(domain)
  if (!instructions) {
    return {
      ok: false,
      code: 'INGRESS_NOT_CONFIGURED',
      message: 'The Relay ingress CNAME target is not configured.',
      domain,
    }
  }

  const checkedAt = new Date().toISOString()
  const result = evaluateDomainDNSEvidence(instructions, evidence)
  if (!result.ok) {
    const updated = await updateDomain(
      payload,
      id,
      {
        lastCheckedAt: checkedAt,
        lastVerificationError: result.message,
        status: 'pending-dns',
      },
      req,
    )
    return {
      ok: false,
      code: 'DNS_EVIDENCE_REJECTED',
      message: result.message,
      domain: updated,
    }
  }

  return {
    ok: true,
    domain: await updateDomain(
      payload,
      id,
      {
        cnameVerifiedAt: checkedAt,
        dnsVerifiedAt: checkedAt,
        lastCheckedAt: checkedAt,
        lastVerificationError: null,
      },
      req,
    ),
  }
}

export async function recordDomainTLSReady(
  payload: Payload,
  id: DomainIdentifier,
  certificate: { certificateID: string; renewsAt: null | string },
  req?: PayloadRequest,
): Promise<DomainLifecycleResult> {
  const domain = await loadDomain(payload, id, req)
  if (domain.status !== 'verifying' || !domain.dnsVerifiedAt || !domain.cnameVerifiedAt) {
    return {
      ok: false,
      code: 'INVALID_STATE',
      message: 'Verified DNS evidence is required before recording TLS readiness.',
      domain,
    }
  }

  return {
    ok: true,
    domain: await updateDomain(
      payload,
      id,
      {
        lastCheckedAt: new Date().toISOString(),
        lastVerificationError: null,
        status: 'certificate-ready',
        tlsCertificateRef: certificate.certificateID,
        tlsRenewsAt: certificate.renewsAt,
        tlsReadyAt: new Date().toISOString(),
      },
      req,
    ),
  }
}

export async function publishDomainAssociations(
  payload: Payload,
  id: DomainIdentifier,
  req?: PayloadRequest,
): Promise<DomainLifecycleResult> {
  const domain = await loadDomain(payload, id, req)
  if (domain.status !== 'certificate-ready') {
    return {
      ok: false,
      code: 'INVALID_STATE',
      message: 'TLS must be ready before association documents are published.',
      domain,
    }
  }

  return {
    ok: true,
    domain: await updateDomain(payload, id, { status: 'association-incomplete' }, req),
  }
}

export async function activateDomain(
  payload: Payload,
  id: DomainIdentifier,
  req?: PayloadRequest,
): Promise<DomainLifecycleResult> {
  const domain = await loadDomain(payload, id, req)
  if (domain.status !== 'association-incomplete') {
    return {
      ok: false,
      code: 'INVALID_STATE',
      message: 'Association confirmation is required before activation.',
      domain,
    }
  }

  const activatedAt = new Date().toISOString()
  return {
    ok: true,
    domain: await updateDomain(
      payload,
      id,
      {
        activatedAt,
        associationsVerifiedAt: activatedAt,
        lastVerificationError: null,
        status: 'active',
      },
      req,
    ),
  }
}
