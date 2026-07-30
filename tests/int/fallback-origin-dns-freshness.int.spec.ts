import type { Payload, PayloadRequest } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { evaluateFallbackOriginOwnershipFreshness } from '@/lib/domain/fallback-origin'
import {
  getFallbackOriginDNSRefreshConfiguration,
  sweepFallbackOriginDNSOwnership,
  type FallbackOriginDNSRefreshTransactions,
} from '@/lib/server/fallback-origin-dns-sweep'

type StoredOrigin = Record<string, unknown> & { id: number }

const challenge = 'linksetgo-fallback-verification=abcdefghijklmnopqrstuvwxyz123456'

function verifiedOrigin(overrides: Partial<StoredOrigin> = {}): StoredOrigin {
  return {
    hostname: 'fallback.example',
    id: 1,
    lastCheckedAt: '2026-07-30T09:00:00.000Z',
    lastEvidence: null,
    lastVerificationError: null,
    outageGraceExpiresAt: null,
    revokedAt: null,
    status: 'verified',
    verificationExpiresAt: '2026-07-30T10:30:00.000Z',
    verificationToken: 'abcdefghijklmnopqrstuvwxyz123456',
    verifiedAt: '2026-07-29T10:30:00.000Z',
    workspace: 1,
    ...overrides,
  }
}

class OriginStore {
  readonly records: StoredOrigin[]

  constructor(records: StoredOrigin[]) {
    this.records = records
  }

  async find(input: { limit: number }): Promise<{ docs: unknown[] }> {
    return { docs: this.records.slice(0, input.limit).map((record) => ({ ...record })) }
  }

  async findByID(input: { id: number | string }): Promise<unknown> {
    const record = this.records.find((candidate) => candidate.id === Number(input.id))
    if (!record) throw new Error('Origin not found.')
    return { ...record }
  }

  async update(input: { data: Record<string, unknown>; id: number | string }): Promise<unknown> {
    const index = this.records.findIndex((record) => record.id === Number(input.id))
    if (index < 0) throw new Error('Origin not found.')
    const updated = { ...this.records[index]!, ...input.data }
    this.records[index] = updated
    return { ...updated }
  }
}

const transactions: FallbackOriginDNSRefreshTransactions = {
  acquireLock: async () => undefined,
  commit: async () => undefined,
  createRequest: async () => ({}) as PayloadRequest,
  init: async () => true,
  rollback: async () => undefined,
}

const sweepInput = (store: OriginStore, now: string) => ({
  batchSize: 20,
  evidenceMaxAgeMs: 24 * 60 * 60 * 1_000,
  now: new Date(now),
  outageGraceMs: 6 * 60 * 60 * 1_000,
  payload: store as unknown as Payload,
  renewalLeadMs: 60 * 60 * 1_000,
  transactions,
})

describe('fallback-origin DNS evidence freshness', () => {
  it('fails closed for missing or stale proof and accepts only bounded provider grace', () => {
    const now = new Date('2026-07-30T10:00:00.000Z')
    expect(
      evaluateFallbackOriginOwnershipFreshness(
        {
          status: 'verified',
          verificationExpiresAt: null,
          verifiedAt: '2026-07-30T09:00:00.000Z',
        },
        now,
      ),
    ).toEqual({ ok: false, reason: 'missing-expiry' })
    expect(
      evaluateFallbackOriginOwnershipFreshness(
        {
          outageGraceExpiresAt: null,
          status: 'verified',
          verificationExpiresAt: '2026-07-30T09:59:59.000Z',
          verifiedAt: '2026-07-29T10:00:00.000Z',
        },
        now,
      ),
    ).toEqual({ ok: false, reason: 'expired' })
    expect(
      evaluateFallbackOriginOwnershipFreshness(
        {
          status: 'verified',
          verificationExpiresAt: '2026-07-30T11:00:00.000Z',
          verifiedAt: null,
        },
        now,
      ),
    ).toEqual({ ok: false, reason: 'missing-proof' })
    expect(
      evaluateFallbackOriginOwnershipFreshness(
        {
          outageGraceExpiresAt: '2026-07-30T11:00:00.000Z',
          status: 'verified',
          verificationExpiresAt: '2026-07-30T09:00:00.000Z',
          verifiedAt: '2026-07-29T10:00:00.000Z',
        },
        now,
      ),
    ).toEqual({ mode: 'outage-grace', ok: true })
    expect(
      evaluateFallbackOriginOwnershipFreshness(
        {
          outageGraceExpiresAt: '2026-07-30T11:00:00.000Z',
          status: 'pending',
          verificationExpiresAt: '2026-07-30T12:00:00.000Z',
        },
        now,
      ),
    ).toEqual({ ok: false, reason: 'unverified' })
  })

  it('renews verified TXT ownership before expiry', async () => {
    const store = new OriginStore([verifiedOrigin()])
    const provider = {
      lookupTXT: vi.fn(async () => ({
        observedAt: '2026-07-30T10:00:00.000Z',
        values: [challenge],
      })),
    }
    const summary = await sweepFallbackOriginDNSOwnership({
      ...sweepInput(store, '2026-07-30T10:00:00.000Z'),
      provider,
    })

    expect(summary).toMatchObject({ renewed: 1 })
    expect(provider.lookupTXT).toHaveBeenCalledWith('_linksetgo-fallback.fallback.example')
    expect(store.records[0]).toMatchObject({
      lastVerificationError: null,
      outageGraceExpiresAt: null,
      status: 'verified',
      verificationExpiresAt: '2026-07-31T10:00:00.000Z',
      verifiedAt: '2026-07-30T10:00:00.000Z',
    })
  })

  it('performs DNS lookup between short claim and finalize transactions', async () => {
    const store = new OriginStore([verifiedOrigin()])
    let activeTransactions = 0
    const trackedTransactions: FallbackOriginDNSRefreshTransactions = {
      acquireLock: async () => undefined,
      commit: async () => {
        activeTransactions -= 1
      },
      createRequest: async () => ({}) as PayloadRequest,
      init: async () => {
        activeTransactions += 1
        return true
      },
      rollback: async () => {
        activeTransactions -= 1
      },
    }

    await expect(
      sweepFallbackOriginDNSOwnership({
        ...sweepInput(store, '2026-07-30T10:00:00.000Z'),
        provider: {
          lookupTXT: async () => {
            expect(activeTransactions).toBe(0)
            return {
              observedAt: '2026-07-30T10:00:00.000Z',
              values: [challenge],
            }
          },
        },
        transactions: trackedTransactions,
      }),
    ).resolves.toMatchObject({ renewed: 1 })
    expect(activeTransactions).toBe(0)
  })

  it('immediately withdraws ownership when the TXT challenge is removed', async () => {
    const store = new OriginStore([verifiedOrigin()])
    const summary = await sweepFallbackOriginDNSOwnership({
      ...sweepInput(store, '2026-07-30T10:00:00.000Z'),
      provider: {
        lookupTXT: async () => ({
          observedAt: '2026-07-30T10:00:00.000Z',
          values: [],
        }),
      },
    })

    expect(summary).toMatchObject({ evidenceRemoved: 1 })
    expect(store.records[0]).toMatchObject({
      outageGraceExpiresAt: null,
      status: 'pending',
      verificationExpiresAt: null,
    })
  })

  it('uses one non-extendable outage grace window and fails closed after it', async () => {
    const store = new OriginStore([
      verifiedOrigin({
        verificationExpiresAt: '2026-07-30T09:00:00.000Z',
        verifiedAt: '2026-07-29T09:00:00.000Z',
      }),
    ])
    const unavailable = {
      lookupTXT: vi.fn(async () => {
        throw new Error('provider unavailable')
      }),
    }

    const first = await sweepFallbackOriginDNSOwnership({
      ...sweepInput(store, '2026-07-30T10:00:00.000Z'),
      provider: unavailable,
    })
    expect(first).toMatchObject({ graceActivated: 1 })
    expect(store.records[0]).toMatchObject({
      outageGraceExpiresAt: '2026-07-30T15:00:00.000Z',
      status: 'verified',
    })

    await sweepFallbackOriginDNSOwnership({
      ...sweepInput(store, '2026-07-30T11:00:00.000Z'),
      provider: unavailable,
    })
    expect(store.records[0]?.outageGraceExpiresAt).toBe('2026-07-30T15:00:00.000Z')

    const expired = await sweepFallbackOriginDNSOwnership({
      ...sweepInput(store, '2026-07-30T15:00:00.000Z'),
      provider: unavailable,
    })
    expect(expired).toMatchObject({ errors: 1 })
    expect(store.records[0]).toMatchObject({
      outageGraceExpiresAt: null,
      status: 'pending',
    })
  })

  it('validates bounded operator configuration', () => {
    expect(getFallbackOriginDNSRefreshConfiguration({})).toMatchObject({
      batchSize: 20,
      evidenceMaxAgeMs: 24 * 60 * 60 * 1_000,
      outageGraceMs: 6 * 60 * 60 * 1_000,
      status: 'ready',
    })
    expect(
      getFallbackOriginDNSRefreshConfiguration({
        FALLBACK_ORIGIN_DNS_OUTAGE_GRACE_SECONDS: String(24 * 60 * 60 + 1),
      }),
    ).toMatchObject({ status: 'misconfigured' })
    expect(
      getFallbackOriginDNSRefreshConfiguration({
        FALLBACK_ORIGIN_DNS_SWEEP_BATCH_SIZE: '51',
      }),
    ).toMatchObject({ status: 'misconfigured' })
  })
})
