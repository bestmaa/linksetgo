import { describe, expect, it } from 'vitest'

import {
  buildDomainVerificationInstructions,
  evaluateDomainDNSEvidence,
} from '@/lib/domain/domain-verification'

describe('custom-domain DNS evidence', () => {
  const instructions = buildDomainVerificationInstructions({
    hostname: 'Links.OberoiMall.com.',
    ingressCnameTarget: 'Ingress.Relay.Example.',
    verificationToken: 'abcdefghijklmnopqrstuvwxyz123456',
  })

  it('publishes only fixed TXT and CNAME instructions', () => {
    expect(instructions).toEqual({
      cname: {
        name: 'links.oberoimall.com',
        target: 'ingress.relay.example',
        type: 'CNAME',
      },
      ownership: {
        name: '_relay-verification.links.oberoimall.com',
        type: 'TXT',
        value: 'relay-domain-verification=abcdefghijklmnopqrstuvwxyz123456',
      },
    })
  })

  it('accepts exact ownership and ingress evidence without fetching an arbitrary URL', () => {
    expect(
      evaluateDomainDNSEvidence(instructions!, {
        cnameTargets: ['Ingress.Relay.Example.'],
        txtValues: ['"relay-domain-verification=abcdefghijklmnopqrstuvwxyz123456"'],
      }),
    ).toEqual({ ok: true, cnameTarget: 'ingress.relay.example' })
  })

  it('rejects a copied challenge or an attacker-controlled CNAME target', () => {
    expect(
      evaluateDomainDNSEvidence(instructions!, {
        cnameTargets: ['ingress.relay.example'],
        txtValues: ['relay-domain-verification=wrong-token'],
      }),
    ).toMatchObject({ ok: false, code: 'OWNERSHIP_CHALLENGE_MISSING' })

    expect(
      evaluateDomainDNSEvidence(instructions!, {
        cnameTargets: ['attacker.example'],
        txtValues: ['relay-domain-verification=abcdefghijklmnopqrstuvwxyz123456'],
      }),
    ).toMatchObject({ ok: false, code: 'CNAME_MISMATCH' })
  })
})
