import { describe, expect, it } from 'vitest'

import { InMemoryRateLimitProvider } from '../../src/lib/application/rate-limit-provider'
import {
  rateLimitCloudSignupRequest,
  rateLimitCloudVerificationResendEmail,
  rateLimitPasswordRecoveryEmail,
  rateLimitPasswordResetRequest,
} from '../../src/lib/server/cloud-signup-rate-limit'

const secret = 'rate-limit-test-secret-with-32-characters'

const requestWithHeaders = (headers: HeadersInit): Request =>
  new Request('https://app.linksetgo.test/api/auth/signup', {
    headers: { 'user-agent': 'Relay rate-limit test', ...headers },
    method: 'POST',
  })

describe('Cloud signup proxy identity', () => {
  it('ignores spoofed client-IP headers unless their separate trust flag is enabled', async () => {
    const provider = new InMemoryRateLimitProvider(() => 1_000)

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const decision = await rateLimitCloudSignupRequest({
        eventHashSecret: secret,
        provider,
        request: requestWithHeaders({ 'x-forwarded-for': `203.0.113.${attempt + 1}` }),
        trustProxy: false,
      })
      expect(decision.allowed).toBe(true)
    }

    await expect(
      rateLimitCloudSignupRequest({
        eventHashSecret: secret,
        provider,
        request: requestWithHeaders({ 'x-forwarded-for': '198.51.100.200' }),
        trustProxy: false,
      }),
    ).resolves.toMatchObject({ allowed: false })
  })

  it('uses only one canonical trusted IP and rejects forwarding chains', async () => {
    const provider = new InMemoryRateLimitProvider(() => 1_000)
    const first = await rateLimitCloudSignupRequest({
      eventHashSecret: secret,
      provider,
      request: requestWithHeaders({ 'x-forwarded-for': '203.0.113.10' }),
      trustProxy: true,
    })
    const second = await rateLimitCloudSignupRequest({
      eventHashSecret: secret,
      provider,
      request: requestWithHeaders({ 'x-forwarded-for': '203.0.113.11' }),
      trustProxy: true,
    })
    expect(first.remaining).toBe(9)
    expect(second.remaining).toBe(9)

    const chained = await rateLimitCloudSignupRequest({
      eventHashSecret: secret,
      provider,
      request: requestWithHeaders({ 'x-forwarded-for': '198.51.100.1, 203.0.113.20' }),
      trustProxy: true,
    })
    const anotherChain = await rateLimitCloudSignupRequest({
      eventHashSecret: secret,
      provider,
      request: requestWithHeaders({ 'x-forwarded-for': '192.0.2.9, 203.0.113.20' }),
      trustProxy: true,
    })
    expect(chained.remaining).toBe(9)
    expect(anotherChain.remaining).toBe(8)
  })

  it('keeps verification resend and password recovery email budgets separate', async () => {
    const provider = new InMemoryRateLimitProvider(() => 1_000)
    const input = {
      email: 'rate-limit-account@linksetgo.test',
      eventHashSecret: secret,
      provider,
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(rateLimitCloudVerificationResendEmail(input)).resolves.toMatchObject({
        allowed: true,
      })
    }
    await expect(rateLimitCloudVerificationResendEmail(input)).resolves.toMatchObject({
      allowed: false,
    })

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await expect(rateLimitPasswordRecoveryEmail(input)).resolves.toMatchObject({
        allowed: true,
      })
    }
    await expect(rateLimitPasswordRecoveryEmail(input)).resolves.toMatchObject({
      allowed: false,
    })
  })

  it('limits password-reset attempts by privacy-safe request identity', async () => {
    const provider = new InMemoryRateLimitProvider(() => 1_000)
    const input = {
      eventHashSecret: secret,
      provider,
      request: requestWithHeaders({}),
      trustProxy: false,
    }
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await expect(rateLimitPasswordResetRequest(input)).resolves.toMatchObject({
        allowed: true,
      })
    }
    await expect(rateLimitPasswordResetRequest(input)).resolves.toMatchObject({
      allowed: false,
    })
  })

  it('does not let browser-controlled headers manufacture identities without a trusted ingress', async () => {
    const provider = new InMemoryRateLimitProvider(() => 1_000)

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const decision = await rateLimitCloudSignupRequest({
        eventHashSecret: secret,
        provider,
        request: new Request('https://app.linksetgo.test/api/auth/signup', {
          headers: { 'user-agent': `rotating-agent-${attempt}` },
          method: 'POST',
        }),
        trustProxy: false,
      })
      expect(decision.allowed).toBe(true)
    }

    await expect(
      rateLimitCloudSignupRequest({
        eventHashSecret: secret,
        provider,
        request: new Request('https://app.linksetgo.test/api/auth/signup', {
          headers: { 'user-agent': 'rotating-agent-final' },
          method: 'POST',
        }),
        trustProxy: false,
      }),
    ).resolves.toMatchObject({ allowed: false })
  })

  it('atomically preserves the global budget when one scoped identity is blocked', async () => {
    const provider = new InMemoryRateLimitProvider(() => 1_000)
    const global = { bucket: 'test-global', key: 'a'.repeat(64), limit: 2, windowMs: 60_000 }
    const scopedA = {
      bucket: 'test-scoped',
      key: 'b'.repeat(64),
      limit: 1,
      windowMs: 60_000,
    }
    const scopedB = { ...scopedA, key: 'c'.repeat(64) }
    const scopedC = { ...scopedA, key: 'd'.repeat(64) }

    await expect(provider.consumePair(global, scopedA)).resolves.toMatchObject({ allowed: true })
    await expect(provider.consumePair(global, scopedA)).resolves.toMatchObject({ allowed: false })
    await expect(provider.consumePair(global, scopedB)).resolves.toMatchObject({ allowed: true })
    await expect(provider.consumePair(global, scopedC)).resolves.toMatchObject({ allowed: false })
  })
})
