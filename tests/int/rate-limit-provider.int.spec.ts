import { describe, expect, it } from 'vitest'

import { InMemoryRateLimitProvider } from '../../src/lib/application/rate-limit-provider'

describe('single-instance rate limit provider', () => {
  it('blocks after the configured fixed-window limit', async () => {
    const provider = new InMemoryRateLimitProvider(() => 1_000)
    const request = { bucket: 'signup', key: 'privacy-safe-key', limit: 2, windowMs: 60_000 }

    await expect(provider.consume(request)).resolves.toMatchObject({ allowed: true, remaining: 1 })
    await expect(provider.consume(request)).resolves.toMatchObject({ allowed: true, remaining: 0 })
    await expect(provider.consume(request)).resolves.toMatchObject({ allowed: false, remaining: 0 })
  })

  it('opens a new window after expiry', async () => {
    let now = 1_000
    const provider = new InMemoryRateLimitProvider(() => now)
    const request = { bucket: 'login', key: 'privacy-safe-key', limit: 1, windowMs: 1_000 }

    expect((await provider.consume(request)).allowed).toBe(true)
    expect((await provider.consume(request)).allowed).toBe(false)
    now = 2_001
    expect((await provider.consume(request)).allowed).toBe(true)
  })

  it('isolates buckets that share the same opaque key', async () => {
    const provider = new InMemoryRateLimitProvider(() => 1_000)
    const base = { key: 'privacy-safe-key', limit: 1, windowMs: 60_000 }

    expect((await provider.consume({ ...base, bucket: 'login' })).allowed).toBe(true)
    expect((await provider.consume({ ...base, bucket: 'signup' })).allowed).toBe(true)
  })
})
