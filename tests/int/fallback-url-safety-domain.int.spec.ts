import { describe, expect, it } from 'vitest'

import {
  beginFallbackURLSafetyAssessment,
  canonicalizeFallbackURL,
  completeFallbackURLSafetyAssessment,
  evaluateFallbackURLSafetyReadiness,
  fallbackURLAssessmentHash,
  pendingFallbackURLSafetyAssessment,
} from '@/lib/domain/fallback-url-safety'

describe('fallback URL safety domain', () => {
  it('canonicalizes only public HTTPS URLs without ambiguous authority data', () => {
    expect(canonicalizeFallbackURL(' HTTPS://WWW.Example.COM/download?app=1 ')).toEqual({
      ok: true,
      value: {
        canonicalUrl: 'https://www.example.com/download?app=1',
        hostname: 'www.example.com',
      },
    })
    expect(canonicalizeFallbackURL('https://例え.テスト/download')).toEqual({
      ok: true,
      value: {
        canonicalUrl: 'https://xn--r8jz45g.xn--zckzah/download',
        hostname: 'xn--r8jz45g.xn--zckzah',
      },
    })
  })

  it.each([
    ['http://example.com/download', 'UNSUPPORTED_PROTOCOL'],
    ['https://user:secret@example.com/download', 'CREDENTIALS_NOT_ALLOWED'],
    ['https://example.com:443/download', 'PORT_NOT_ALLOWED'],
    ['https://example.com:8443/download', 'PORT_NOT_ALLOWED'],
    ['https://example.com/download#continue', 'FRAGMENT_NOT_ALLOWED'],
    ['https://localhost/download', 'PUBLIC_HOST_REQUIRED'],
    ['https://127.0.0.1/download', 'PUBLIC_HOST_REQUIRED'],
    ['https://2130706433/download', 'PUBLIC_HOST_REQUIRED'],
    ['https://[::1]/download', 'PUBLIC_HOST_REQUIRED'],
    ['https://internal/download', 'PUBLIC_HOST_REQUIRED'],
    ['https://example.com/a b', 'UNSAFE_CHARACTERS'],
    ['https:\\\\example.com\\download', 'UNSAFE_CHARACTERS'],
  ])('rejects unsafe fallback input %s', (value, code) => {
    expect(canonicalizeFallbackURL(value)).toMatchObject({ code, ok: false })
  })

  it('isolates exact URL fingerprints by workspace', () => {
    const url = 'https://example.com/download?campaign=summer'
    expect(fallbackURLAssessmentHash('workspace-1', url)).not.toBe(
      fallbackURLAssessmentHash('workspace-2', url),
    )
    expect(fallbackURLAssessmentHash('workspace-1', url)).toHaveLength(64)
  })

  it('requires verified ownership and one fresh safe exact-URL assessment', () => {
    const pending = pendingFallbackURLSafetyAssessment({
      canonicalUrl: 'https://example.com/download',
      hostname: 'example.com',
      workspaceId: 'workspace-1',
    })
    const safe = completeFallbackURLSafetyAssessment({
      assessment: beginFallbackURLSafetyAssessment(pending),
      completion: {
        kind: 'safe',
        observedAt: '2026-07-30T10:00:00.000Z',
        redirectCount: 1,
      },
      maxAgeMs: 24 * 60 * 60 * 1_000,
      now: new Date('2026-07-30T10:00:01.000Z'),
    })

    expect(
      evaluateFallbackURLSafetyReadiness({
        assessment: safe,
        now: new Date('2026-07-30T11:00:00.000Z'),
        originStatus: 'revoked',
        workspaceId: 'workspace-1',
      }),
    ).toEqual({ ok: false, reason: 'ownership-revoked' })
    expect(
      evaluateFallbackURLSafetyReadiness({
        assessment: safe,
        now: new Date('2026-07-30T11:00:00.000Z'),
        originStatus: 'pending',
        workspaceId: 'workspace-1',
      }),
    ).toEqual({ ok: false, reason: 'ownership-unverified' })
    expect(
      evaluateFallbackURLSafetyReadiness({
        assessment: safe,
        now: new Date('2026-07-30T11:00:00.000Z'),
        originStatus: 'verified',
        workspaceId: 'workspace-2',
      }),
    ).toEqual({ ok: false, reason: 'workspace-mismatch' })
    expect(
      evaluateFallbackURLSafetyReadiness({
        assessment: safe,
        now: new Date('2026-07-30T11:00:00.000Z'),
        originStatus: 'verified',
        workspaceId: 'workspace-1',
      }),
    ).toEqual({ ok: true, canonicalUrl: 'https://example.com/download' })
    expect(
      evaluateFallbackURLSafetyReadiness({
        assessment: safe,
        now: new Date('2026-08-01T11:00:00.000Z'),
        originStatus: 'verified',
        workspaceId: 'workspace-1',
      }),
    ).toEqual({ ok: false, reason: 'stale' })
  })

  it('keeps unsafe and provider-error outcomes fail closed', () => {
    const pending = pendingFallbackURLSafetyAssessment({
      canonicalUrl: 'https://example.com/download',
      hostname: 'example.com',
      workspaceId: 'workspace-1',
    })
    const unsafe = completeFallbackURLSafetyAssessment({
      assessment: beginFallbackURLSafetyAssessment(pending),
      completion: {
        kind: 'unsafe',
        observedAt: '2026-07-30T10:00:00.000Z',
        redirectCount: 2,
        threats: ['malware', 'malware'],
      },
      maxAgeMs: 60 * 60 * 1_000,
      now: new Date('2026-07-30T10:00:01.000Z'),
    })
    expect(unsafe).toMatchObject({
      redirectCount: 2,
      status: 'unsafe',
      threats: ['malware'],
    })
    expect(
      evaluateFallbackURLSafetyReadiness({
        assessment: unsafe,
        originStatus: 'verified',
        workspaceId: 'workspace-1',
      }),
    ).toEqual({ ok: false, reason: 'unsafe' })

    const failed = completeFallbackURLSafetyAssessment({
      assessment: beginFallbackURLSafetyAssessment(pending),
      completion: { kind: 'error', message: 'scanner unavailable' },
      maxAgeMs: 60 * 60 * 1_000,
      now: new Date('2026-07-30T10:00:01.000Z'),
    })
    expect(failed).toMatchObject({
      expiresAt: null,
      lastError: 'scanner unavailable',
      status: 'error',
    })
  })

  it('never caches a provider verdict beyond the provider expiry', () => {
    const pending = pendingFallbackURLSafetyAssessment({
      canonicalUrl: 'https://example.com/download',
      hostname: 'example.com',
      workspaceId: 'workspace-1',
    })
    const safe = completeFallbackURLSafetyAssessment({
      assessment: beginFallbackURLSafetyAssessment(pending),
      completion: {
        expiresAt: '2026-07-30T10:15:00.000Z',
        kind: 'safe',
        observedAt: '2026-07-30T10:00:00.000Z',
        redirectCount: 0,
      },
      maxAgeMs: 60 * 60 * 1_000,
      now: new Date('2026-07-30T10:00:00.000Z'),
    })
    expect(safe.expiresAt).toBe('2026-07-30T10:15:00.000Z')
  })

  it('rejects replayed and implausibly future-dated provider observations', () => {
    const pending = pendingFallbackURLSafetyAssessment({
      canonicalUrl: 'https://example.com/download',
      hostname: 'example.com',
      workspaceId: 'workspace-1',
    })
    const complete = (observedAt: string) =>
      completeFallbackURLSafetyAssessment({
        assessment: beginFallbackURLSafetyAssessment(pending),
        completion: { kind: 'safe', observedAt, redirectCount: 0 },
        maxAgeMs: 60 * 60 * 1_000,
        now: new Date('2026-07-30T10:10:00.000Z'),
      })

    expect(() => complete('2026-07-30T10:04:59.999Z')).toThrow(/stale or future-dated/i)
    expect(() => complete('2026-07-30T10:12:00.001Z')).toThrow(/stale or future-dated/i)
    expect(complete('2026-07-30T10:05:00.000Z')).toMatchObject({ status: 'safe' })
    expect(complete('2026-07-30T10:12:00.000Z')).toMatchObject({ status: 'safe' })
  })
})
