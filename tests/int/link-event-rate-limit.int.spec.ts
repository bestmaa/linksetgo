import { InMemoryRateLimitProvider } from '@/lib/application/rate-limit-provider'
import { EVENT_CLIENT_RATE_LIMIT, EVENT_LINK_TYPE_RATE_LIMIT } from '@/lib/domain/event-policy'
import {
  admitInteractionLinkEvent,
  admitPublicLinkResolution,
  admitResolvedLinkEvent,
  EVENT_TOKEN_MULTIPLICITY,
  RESOLVER_CLIENT_LINK_RATE_LIMIT,
  RESOLVER_CLIENT_RATE_LIMIT,
  RESOLVER_LINK_RATE_LIMIT,
} from '@/lib/server/link-event-rate-limit'
import { describe, expect, it } from 'vitest'

const secret = 'link-event-rate-secret-with-at-least-thirty-two-characters'
const clientKey = (value: number): string => value.toString(16).padStart(64, '0')

describe('distributed public link-event admission policy', () => {
  it('atomically deduplicates concurrent resolved events with a stable client identity', async () => {
    const provider = new InMemoryRateLimitProvider(() => 1_000)
    const input = {
      clientKey: clientKey(1),
      eventHashSecret: secret,
      provider,
      resourceKey: clientKey(42),
    }

    const decisions = await Promise.all([
      admitResolvedLinkEvent(input),
      admitResolvedLinkEvent(input),
    ])
    expect(decisions.filter(({ allowed }) => allowed)).toHaveLength(1)
    expect(decisions.filter(({ allowed }) => !allowed)).toEqual([
      { allowed: false, reason: 'duplicate' },
    ])
  })

  it('limits resolver traffic per client, per client/link, and per public link', async () => {
    const sameLinkProvider = new InMemoryRateLimitProvider(() => 1_000)
    const sameLink = {
      appSlug: 'oberoi',
      clientKey: clientKey(1),
      eventHashSecret: secret,
      hostname: 'go.linksetgo.com',
      linkSlug: 'offer',
      provider: sameLinkProvider,
    }
    for (let count = 0; count < RESOLVER_CLIENT_LINK_RATE_LIMIT; count += 1) {
      await expect(admitPublicLinkResolution(sameLink)).resolves.toEqual({ allowed: true })
    }
    await expect(admitPublicLinkResolution(sameLink)).resolves.toMatchObject({
      allowed: false,
      reason: 'client-rate',
    })

    const clientProvider = new InMemoryRateLimitProvider(() => 1_000)
    for (let count = 0; count < RESOLVER_CLIENT_RATE_LIMIT; count += 1) {
      await expect(
        admitPublicLinkResolution({
          ...sameLink,
          linkSlug: `offer-${count}`,
          provider: clientProvider,
        }),
      ).resolves.toEqual({ allowed: true })
    }
    await expect(
      admitPublicLinkResolution({
        ...sameLink,
        linkSlug: 'over-client-limit',
        provider: clientProvider,
      }),
    ).resolves.toMatchObject({ allowed: false, reason: 'client-rate' })

    const targetProvider = new InMemoryRateLimitProvider(() => 1_000)
    for (let count = 0; count < RESOLVER_LINK_RATE_LIMIT; count += 1) {
      await expect(
        admitPublicLinkResolution({
          ...sameLink,
          clientKey: clientKey(count + 1),
          provider: targetProvider,
        }),
      ).resolves.toEqual({ allowed: true })
    }
    await expect(
      admitPublicLinkResolution({
        ...sameLink,
        clientKey: clientKey(RESOLVER_LINK_RATE_LIMIT + 1),
        provider: targetProvider,
      }),
    ).resolves.toMatchObject({ allowed: false, reason: 'link-rate' })
  })

  it('does not turn an untrusted direct ingress into one shared client-denial bucket', async () => {
    const resolverProvider = new InMemoryRateLimitProvider(() => 1_000)
    for (let count = 0; count <= RESOLVER_CLIENT_RATE_LIMIT; count += 1) {
      await expect(
        admitPublicLinkResolution({
          appSlug: 'community-app',
          clientKey: clientKey(1),
          clientRateLimit: false,
          eventHashSecret: secret,
          hostname: 'localhost',
          linkSlug: `link-${count}`,
          provider: resolverProvider,
        }),
      ).resolves.toEqual({ allowed: true })
    }

    const eventProvider = new InMemoryRateLimitProvider(() => 1_000)
    for (let count = 0; count <= EVENT_CLIENT_RATE_LIMIT; count += 1) {
      await expect(
        admitInteractionLinkEvent({
          clientKey: clientKey(1),
          clientRateLimit: false,
          eventHashSecret: secret,
          eventType: 'store-clicked',
          provider: eventProvider,
          resourceKey: clientKey(count + 100),
          tokenNonce: `direct-token-${count}`,
          tokenWindowMs: 10 * 60_000,
        }),
      ).resolves.toMatchObject({ allowed: true })
    }
  })

  it('ignores caller session rotation and atomically enforces token event multiplicity', async () => {
    const provider = new InMemoryRateLimitProvider(() => 1_000)
    const fallback = {
      clientKey: clientKey(1),
      eventHashSecret: secret,
      eventType: 'fallback-viewed' as const,
      provider,
      resourceKey: clientKey(42),
      tokenNonce: 'server-minted-nonce',
      tokenWindowMs: 10 * 60_000,
    }
    expect(EVENT_TOKEN_MULTIPLICITY['fallback-viewed']).toBe(1)
    await expect(admitInteractionLinkEvent(fallback)).resolves.toMatchObject({ allowed: true })
    await expect(
      admitInteractionLinkEvent({ ...fallback, clientKey: clientKey(2) }),
    ).resolves.toEqual({ allowed: false, reason: 'token-rate' })

    const openApp = {
      ...fallback,
      eventType: 'open-app-clicked' as const,
      tokenNonce: 'another-server-minted-nonce',
    }
    for (let count = 0; count < EVENT_TOKEN_MULTIPLICITY['open-app-clicked']; count += 1) {
      await expect(admitInteractionLinkEvent(openApp)).resolves.toMatchObject({ allowed: true })
    }
    await expect(admitInteractionLinkEvent(openApp)).resolves.toEqual({
      allowed: false,
      reason: 'token-rate',
    })
  })

  it('caps event submissions per client and per link/event across clients', async () => {
    const clientProvider = new InMemoryRateLimitProvider(() => 1_000)
    for (let count = 0; count < EVENT_CLIENT_RATE_LIMIT; count += 1) {
      await expect(
        admitInteractionLinkEvent({
          clientKey: clientKey(1),
          eventHashSecret: secret,
          eventType: 'store-clicked',
          provider: clientProvider,
          resourceKey: clientKey(count + 1_000),
          tokenNonce: `token-${count}`,
          tokenWindowMs: 10 * 60_000,
        }),
      ).resolves.toMatchObject({ allowed: true })
    }
    await expect(
      admitInteractionLinkEvent({
        clientKey: clientKey(1),
        eventHashSecret: secret,
        eventType: 'store-clicked',
        provider: clientProvider,
        resourceKey: clientKey(999),
        tokenNonce: 'over-client-limit',
        tokenWindowMs: 10 * 60_000,
      }),
    ).resolves.toEqual({ allowed: false, reason: 'client-rate' })

    const targetProvider = new InMemoryRateLimitProvider(() => 1_000)
    for (let count = 0; count < EVENT_LINK_TYPE_RATE_LIMIT; count += 1) {
      await expect(
        admitInteractionLinkEvent({
          clientKey: clientKey(count + 1),
          eventHashSecret: secret,
          eventType: 'store-clicked',
          provider: targetProvider,
          resourceKey: clientKey(42),
          tokenNonce: `token-${count}`,
          tokenWindowMs: 10 * 60_000,
        }),
      ).resolves.toMatchObject({ allowed: true })
    }
    await expect(
      admitInteractionLinkEvent({
        clientKey: clientKey(EVENT_LINK_TYPE_RATE_LIMIT + 1),
        eventHashSecret: secret,
        eventType: 'store-clicked',
        provider: targetProvider,
        resourceKey: clientKey(42),
        tokenNonce: 'over-target-limit',
        tokenWindowMs: 10 * 60_000,
      }),
    ).resolves.toEqual({ allowed: false, reason: 'client-rate' })
  })
})
