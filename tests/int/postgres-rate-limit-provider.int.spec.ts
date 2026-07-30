import { describe, expect, it, vi } from 'vitest'

import {
  PostgresRateLimitProvider,
  pruneExpiredPostgresRateLimitWindows,
} from '@/lib/server/postgres-rate-limit-provider'

const request = {
  bucket: 'cloud-signup-email',
  key: 'a'.repeat(64),
  limit: 4,
  windowMs: 60_000,
}

describe('PostgreSQL rate-limit provider', () => {
  it('projects the atomic database result into one fixed-window decision', async () => {
    const execute = vi.fn(async () => ({
      rows: [{ count: 2, reset_at: new Date('2026-07-30T15:00:00.000Z') }],
    }))
    const provider = new PostgresRateLimitProvider(async () => ({ execute }))

    await expect(provider.consume(request)).resolves.toEqual({
      allowed: true,
      remaining: 2,
      resetAt: '2026-07-30T15:00:00.000Z',
    })
    expect(execute).toHaveBeenCalledOnce()
  })

  it('blocks after the persisted count exceeds the shared limit', async () => {
    const provider = new PostgresRateLimitProvider(async () => ({
      execute: async () => ({
        rows: [{ count: '5', reset_at: '2026-07-30T15:00:00.000Z' }],
      }),
    }))

    await expect(provider.consume(request)).resolves.toMatchObject({
      allowed: false,
      remaining: 0,
    })
  })

  it('projects one atomic paired decision without partially consuming a bucket', async () => {
    const execute = vi.fn(async () => ({
      rows: [
        {
          allowed: true,
          remaining: 3,
          reset_at: '2026-07-30T15:00:00.000Z',
        },
      ],
    }))
    const provider = new PostgresRateLimitProvider(async () => ({ execute }))

    await expect(
      provider.consumePair(request, {
        ...request,
        bucket: 'cloud-signup-global',
        key: 'b'.repeat(64),
        limit: 100,
      }),
    ).resolves.toEqual({
      allowed: true,
      remaining: 3,
      resetAt: '2026-07-30T15:00:00.000Z',
    })
    expect(execute).toHaveBeenCalledOnce()
  })

  it('prunes expired windows only through the bounded sweep operation', async () => {
    const execute = vi.fn(async () => ({ rows: [{ deleted_count: 25 }] }))
    await expect(
      pruneExpiredPostgresRateLimitWindows({
        batchSize: 25,
        database: async () => ({ execute }),
      }),
    ).resolves.toBe(25)
    expect(execute).toHaveBeenCalledOnce()
  })

  it('fails closed without querying for raw or malformed keys', async () => {
    const execute = vi.fn()
    const provider = new PostgresRateLimitProvider(
      async () => ({ execute }),
      () => Date.parse('2026-07-30T14:00:00.000Z'),
    )

    await expect(provider.consume({ ...request, key: 'raw-email@example.com' })).resolves.toEqual({
      allowed: false,
      remaining: 0,
      resetAt: '2026-07-30T14:01:00.000Z',
    })
    expect(execute).not.toHaveBeenCalled()
  })

  it('fails closed when the shared store is unavailable or malformed', async () => {
    const unavailable = new PostgresRateLimitProvider(
      async () => {
        throw new Error('private database detail')
      },
      () => Date.parse('2026-07-30T14:00:00.000Z'),
    )
    const malformed = new PostgresRateLimitProvider(
      async () => ({ execute: async () => ({ rows: [{ count: -1, reset_at: 'invalid' }] }) }),
      () => Date.parse('2026-07-30T14:00:00.000Z'),
    )

    await expect(unavailable.consume(request)).resolves.toMatchObject({
      allowed: false,
      resetAt: '2026-07-30T14:01:00.000Z',
    })
    await expect(malformed.consume(request)).resolves.toMatchObject({
      allowed: false,
      resetAt: '2026-07-30T14:01:00.000Z',
    })
  })
})
