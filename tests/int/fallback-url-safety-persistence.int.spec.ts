import { APIError, type Payload } from 'payload'
import { describe, expect, it } from 'vitest'

import {
  ensureFallbackURLSafetyAssessment,
  findReadyFallbackURL,
  runFallbackURLSafetyAssessment,
} from '@/lib/server/fallback-url-safety-service'

type StoredAssessment = Record<string, unknown> & { id: number }
type StoredOrigin = {
  hostname: string
  id: number
  outageGraceExpiresAt: null | string
  status: 'pending' | 'verified'
  verificationExpiresAt: null | string
  verifiedAt: null | string
  workspace: number
}

function equalityValue(condition: unknown): unknown {
  return typeof condition === 'object' && condition !== null && 'equals' in condition
    ? (condition as { equals: unknown }).equals
    : undefined
}

class InMemorySafetyPayload {
  private nextID = 1
  readonly assessments: StoredAssessment[] = []
  readonly origins = new Map<number, StoredOrigin>([
    [
      10,
      {
        hostname: 'fallback.example',
        id: 10,
        outageGraceExpiresAt: null,
        status: 'verified',
        verificationExpiresAt: '2026-07-31T10:00:00.000Z',
        verifiedAt: '2026-07-30T10:00:00.000Z',
        workspace: 1,
      },
    ],
  ])

  async findByID(input: { collection: string; id: number | string }): Promise<StoredOrigin> {
    if (input.collection !== 'fallback-origins') throw new Error('Unexpected collection.')
    const origin = this.origins.get(Number(input.id))
    if (!origin) throw new Error('Origin not found.')
    return origin
  }

  async find(input: {
    collection: string
    where: {
      and?: Array<Record<string, unknown>>
    }
  }): Promise<{ docs: unknown[] }> {
    if (input.collection === 'fallback-origins') {
      return { docs: [...this.origins.values()] }
    }
    if (input.collection !== 'fallback-url-safety-assessments') {
      throw new Error('Unexpected collection.')
    }
    const conditions = input.where.and ?? []
    const workspace = conditions.find((condition) => 'workspace' in condition)?.workspace
    const urlHash = conditions.find((condition) => 'urlHash' in condition)?.urlHash
    return {
      docs: this.assessments.filter(
        (assessment) =>
          assessment.workspace === equalityValue(workspace) &&
          assessment.urlHash === equalityValue(urlHash),
      ),
    }
  }

  async create(input: {
    collection: string
    data: Record<string, unknown>
  }): Promise<StoredAssessment> {
    if (input.collection !== 'fallback-url-safety-assessments') {
      throw new Error('Unexpected collection.')
    }
    const record = { ...input.data, id: this.nextID++ }
    this.assessments.push(record)
    return record
  }

  async update(input: {
    collection: string
    data: Record<string, unknown>
    id: number | string
  }): Promise<StoredAssessment> {
    if (input.collection !== 'fallback-url-safety-assessments') {
      throw new Error('Unexpected collection.')
    }
    const index = this.assessments.findIndex((assessment) => assessment.id === Number(input.id))
    const current = this.assessments[index]
    if (!current) throw new Error('Assessment not found.')
    const record = { ...current, ...input.data }
    this.assessments[index] = record
    return record
  }
}

describe('fallback URL safety persistence helpers', () => {
  it('creates one pending exact-URL assessment and reuses it', async () => {
    const store = new InMemorySafetyPayload()
    const payload = store as unknown as Payload
    const first = await ensureFallbackURLSafetyAssessment({
      originId: 10,
      payload,
      url: 'https://fallback.example/download',
      workspaceId: 1,
    })
    const second = await ensureFallbackURLSafetyAssessment({
      originId: 10,
      payload,
      url: 'https://fallback.example/download',
      workspaceId: 1,
    })

    expect(first).toMatchObject({
      canonicalUrl: 'https://fallback.example/download',
      originId: '10',
      status: 'pending',
      workspaceId: '1',
    })
    expect(second.id).toBe(first.id)
    expect(store.assessments).toHaveLength(1)
  })

  it('rejects cross-workspace and hostname/origin confusion', async () => {
    const payload = new InMemorySafetyPayload() as unknown as Payload
    await expect(
      ensureFallbackURLSafetyAssessment({
        originId: 10,
        payload,
        url: 'https://fallback.example/download',
        workspaceId: 2,
      }),
    ).rejects.toBeInstanceOf(APIError)
    await expect(
      ensureFallbackURLSafetyAssessment({
        originId: 10,
        payload,
        url: 'https://attacker.example/download',
        workspaceId: 1,
      }),
    ).rejects.toThrow(/does not match/i)
  })

  it('persists provider results and projects only verified, fresh, exact URLs', async () => {
    const store = new InMemorySafetyPayload()
    const payload = store as unknown as Payload
    const assessed = await runFallbackURLSafetyAssessment({
      now: new Date('2026-07-30T10:00:00.000Z'),
      originId: 10,
      payload,
      providerConfiguration: {
        available: true,
        maxAgeMs: 60 * 60 * 1_000,
        provider: {
          assessURL: async () => ({
            kind: 'safe',
            observedAt: '2026-07-30T09:59:59.000Z',
            redirectCount: 1,
          }),
        },
      },
      url: 'https://fallback.example/download',
      workspaceId: 1,
    })
    expect(assessed).toMatchObject({
      expiresAt: '2026-07-30T11:00:00.000Z',
      redirectCount: 1,
      status: 'safe',
    })

    await expect(
      findReadyFallbackURL({
        now: new Date('2026-07-30T10:30:00.000Z'),
        payload,
        url: 'https://fallback.example/download',
        workspaceId: 1,
      }),
    ).resolves.toMatchObject({
      canonicalUrl: 'https://fallback.example/download',
      ok: true,
    })
    await expect(
      findReadyFallbackURL({
        now: new Date('2026-07-30T10:30:00.000Z'),
        payload,
        url: 'https://fallback.example/download?other=1',
        workspaceId: 1,
      }),
    ).resolves.toEqual({ ok: false, reason: 'missing-assessment' })
    await expect(
      findReadyFallbackURL({
        now: new Date('2026-07-30T12:00:00.000Z'),
        payload,
        url: 'https://fallback.example/download',
        workspaceId: 1,
      }),
    ).resolves.toEqual({ ok: false, reason: 'stale' })

    store.origins.get(10)!.status = 'pending'
    await expect(
      findReadyFallbackURL({
        now: new Date('2026-07-30T10:30:00.000Z'),
        payload,
        url: 'https://fallback.example/download',
        workspaceId: 1,
      }),
    ).resolves.toEqual({ ok: false, reason: 'ownership-unverified' })

    store.origins.get(10)!.status = 'verified'
    store.origins.get(10)!.verificationExpiresAt = '2026-07-30T10:00:00.000Z'
    await expect(
      findReadyFallbackURL({
        now: new Date('2026-07-30T10:30:00.000Z'),
        payload,
        url: 'https://fallback.example/download',
        workspaceId: 1,
      }),
    ).resolves.toEqual({ ok: false, reason: 'ownership-unverified' })
  })
})
