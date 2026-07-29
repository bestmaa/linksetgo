import { describe, expect, it } from 'vitest'

import {
  buildDomainVerificationInstructions,
  evaluateDomainDNSEvidence,
} from '@/lib/domain/domain-verification'

describe('custom-domain DNS evidence', () => {
  const instructions = buildDomainVerificationInstructions({
    hostname: 'Links.Example.com.',
    ingressCnameTarget: 'Ingress.LinksetGo.Example.',
    verificationToken: 'abcdefghijklmnopqrstuvwxyz123456',
  })

  it('publishes only fixed TXT and CNAME instructions', () => {
    expect(instructions).toEqual({
      cname: {
        name: 'links.example.com',
        target: 'ingress.linksetgo.example',
        type: 'CNAME',
      },
      ownership: {
        name: '_linksetgo-verification.links.example.com',
        type: 'TXT',
        value: 'linksetgo-domain-verification=abcdefghijklmnopqrstuvwxyz123456',
      },
    })
  })

  it('accepts exact ownership and ingress evidence without fetching an arbitrary URL', () => {
    expect(
      evaluateDomainDNSEvidence(instructions!, {
        cnameTargets: ['Ingress.LinksetGo.Example.'],
        txtValues: ['"linksetgo-domain-verification=abcdefghijklmnopqrstuvwxyz123456"'],
      }),
    ).toEqual({ ok: true, cnameTarget: 'ingress.linksetgo.example' })
  })

  it('rejects a copied challenge or an attacker-controlled CNAME target', () => {
    expect(
      evaluateDomainDNSEvidence(instructions!, {
        cnameTargets: ['ingress.linksetgo.example'],
        txtValues: ['linksetgo-domain-verification=wrong-token'],
      }),
    ).toMatchObject({ ok: false, code: 'OWNERSHIP_CHALLENGE_MISSING' })

    expect(
      evaluateDomainDNSEvidence(instructions!, {
        cnameTargets: ['attacker.example'],
        txtValues: ['linksetgo-domain-verification=abcdefghijklmnopqrstuvwxyz123456'],
      }),
    ).toMatchObject({ ok: false, code: 'CNAME_MISMATCH' })
  })
})
