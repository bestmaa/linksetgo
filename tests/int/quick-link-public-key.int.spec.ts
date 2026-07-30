import { describe, expect, it } from 'vitest'

import { isSharedPublicAppKey } from '@/lib/domain/deployment-surface'
import { quickLinkPublicKeyCandidates } from '@/lib/server/quick-link-public-key'

const eventHashSecret = 'quick-link-public-key-test-secret-with-32-characters'

const firstCandidate = (nativeScheme: string, workspaceId: string): string => {
  const candidate = quickLinkPublicKeyCandidates({
    eventHashSecret,
    nativeScheme,
    workspaceId,
  })[0]
  if (!candidate) throw new Error('Expected a quick-link public-key candidate.')
  return candidate
}

describe('untrusted quick-link public-key allocation', () => {
  it('keeps concurrent Oberoi and PayPal claims stable, unique, and tenant-scoped', async () => {
    const claims = await Promise.all(
      [
        { nativeScheme: 'oberoi', workspaceId: '101' },
        { nativeScheme: 'oberoi', workspaceId: '202' },
        { nativeScheme: 'paypal', workspaceId: '303' },
        { nativeScheme: 'paypal', workspaceId: '404' },
      ].map(async (claim) => ({
        ...claim,
        publicKey: firstCandidate(claim.nativeScheme, claim.workspaceId),
      })),
    )

    expect(new Set(claims.map(({ publicKey }) => publicKey)).size).toBe(claims.length)
    for (const claim of claims) {
      expect(claim.publicKey).toMatch(new RegExp(`^${claim.nativeScheme}-[a-f0-9]{24}$`))
      expect(claim.publicKey).not.toBe(claim.nativeScheme)
      expect(isSharedPublicAppKey(claim.publicKey)).toBe(true)
      expect(firstCandidate(claim.nativeScheme, claim.workspaceId)).toBe(claim.publicKey)
    }
  })

  it('appends the caller tenant suffix even when the scheme imitates another public key', () => {
    const victimKey = firstCandidate('paypal', 'victim-workspace')
    const attackerKey = firstCandidate(victimKey, 'attacker-workspace')

    expect(attackerKey).not.toBe(victimKey)
    expect(attackerKey).toMatch(/-[a-f0-9]{24}$/)
    expect(attackerKey.startsWith(`${victimKey}-`)).toBe(true)
  })

  it('keeps every collision fallback suffixed and within the collection limit', () => {
    const candidates = quickLinkPublicKeyCandidates({
      eventHashSecret,
      nativeScheme: `a${'b'.repeat(63)}`,
      workspaceId: 'long-scheme-workspace',
    })

    expect(candidates).toHaveLength(3)
    expect(new Set(candidates).size).toBe(candidates.length)
    for (const candidate of candidates) {
      expect(candidate.length).toBeLessThanOrEqual(80)
      expect(candidate).not.toBe(`a${'b'.repeat(63)}`)
      expect(isSharedPublicAppKey(candidate)).toBe(true)
    }
  })

  it('fails closed without a strong allocation secret or tenant identity', () => {
    expect(() =>
      quickLinkPublicKeyCandidates({
        eventHashSecret: 'short',
        nativeScheme: 'oberoi',
        workspaceId: '101',
      }),
    ).toThrow(/strong server secret/i)
    expect(() =>
      quickLinkPublicKeyCandidates({
        eventHashSecret,
        nativeScheme: 'oberoi',
        workspaceId: ' ',
      }),
    ).toThrow(/requires a workspace/i)
  })
})
