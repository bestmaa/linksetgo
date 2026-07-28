import { timingSafeEqual } from 'node:crypto'

import { normalizeHostname } from './workspace-domain'

export type DomainDNSEvidence = {
  cnameTargets: readonly string[]
  txtValues: readonly string[]
}

export type DomainVerificationInstructions = {
  cname: {
    name: string
    target: string
    type: 'CNAME'
  }
  ownership: {
    name: string
    type: 'TXT'
    value: string
  }
}

export type DomainDNSEvaluation =
  | {
      ok: true
      cnameTarget: string
    }
  | {
      ok: false
      code: 'CNAME_MISMATCH' | 'OWNERSHIP_CHALLENGE_MISSING'
      message: string
    }

const challengePrefix = 'relay-domain-verification='

const exactSecretMatch = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

export function buildDomainVerificationInstructions(input: {
  hostname: string
  ingressCnameTarget: string
  verificationToken: string
}): DomainVerificationInstructions | null {
  const hostname = normalizeHostname(input.hostname)
  const ingressTarget = normalizeHostname(input.ingressCnameTarget)
  const verificationToken = input.verificationToken.trim()
  if (!hostname || !ingressTarget || verificationToken.length < 24) return null

  return {
    cname: {
      name: hostname,
      target: ingressTarget,
      type: 'CNAME',
    },
    ownership: {
      name: `_relay-verification.${hostname}`,
      type: 'TXT',
      value: `${challengePrefix}${verificationToken}`,
    },
  }
}

export function evaluateDomainDNSEvidence(
  instructions: DomainVerificationInstructions,
  evidence: DomainDNSEvidence,
): DomainDNSEvaluation {
  const hasOwnershipProof = evidence.txtValues
    .map((value) => value.trim().replace(/^"(.*)"$/, '$1'))
    .some((value) => exactSecretMatch(value, instructions.ownership.value))
  if (!hasOwnershipProof) {
    return {
      ok: false,
      code: 'OWNERSHIP_CHALLENGE_MISSING',
      message: 'The expected DNS TXT ownership challenge was not observed.',
    }
  }

  const expectedTarget = normalizeHostname(instructions.cname.target)
  const observedTarget = evidence.cnameTargets
    .map((value) => normalizeHostname(value))
    .find((value) => value === expectedTarget)
  if (!expectedTarget || !observedTarget) {
    return {
      ok: false,
      code: 'CNAME_MISMATCH',
      message: 'The domain CNAME does not point to the configured LinksetGo ingress.',
    }
  }

  return { ok: true, cnameTarget: observedTarget }
}
