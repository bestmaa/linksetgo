import { describe, expect, it } from 'vitest'

import { buildAndroidAssociation, buildAppleAssociation } from '@/lib/domain/associations'
import {
  MAX_ASSOCIATION_DOCUMENT_BYTES,
  serializeAssociationDocument,
} from '@/lib/domain/association-document'
import { publicReadHeaders } from '@/lib/domain/public-read-headers'
import type { App } from '@/payload-types'

const makeApp = (overrides: Partial<App> = {}): App => ({
  id: 1,
  name: 'Shop',
  slug: 'shop',
  status: 'active',
  fallbackUrl: 'https://example.com/',
  allowedFallbackHosts: ['example.com'],
  createdAt: '2026-07-26T00:00:00.000Z',
  updatedAt: '2026-07-26T00:00:00.000Z',
  ...overrides,
})

describe('association builders', () => {
  it('allows read-only browser checks from a separate Cloud console origin', () => {
    expect(publicReadHeaders).toEqual({ 'Access-Control-Allow-Origin': '*' })
    expect(publicReadHeaders).not.toHaveProperty('Access-Control-Allow-Credentials')
  })

  it('builds Apple components only for active, complete iOS apps', () => {
    const association = buildAppleAssociation([
      makeApp({ iosTeamId: 'TEAM123456', iosBundleId: 'com.example.shop' }),
      makeApp({ id: 2, slug: 'paused', status: 'paused', iosTeamId: 'TEAM123456' }),
    ])

    expect(association.applinks.details).toEqual([
      {
        appID: 'TEAM123456.com.example.shop',
        components: [{ '/': '/l/shop/*', comment: 'Deep links for Shop' }],
      },
    ])
  })

  it('normalizes and deduplicates Android fingerprints', () => {
    const fingerprint =
      'aa:bb:cc:dd:ee:ff:00:11:22:33:44:55:66:77:88:99:aa:bb:cc:dd:ee:ff:00:11:22:33:44:55:66:77:88:99'
    const association = buildAndroidAssociation([
      makeApp({
        androidPackageName: 'com.example.shop',
        androidSha256CertFingerprints: [fingerprint, fingerprint],
      }),
    ])

    expect(association).toHaveLength(1)
    expect(association[0]?.target.sha256_cert_fingerprints).toEqual([fingerprint.toUpperCase()])
  })

  it('fails closed instead of publishing an oversized trust document', () => {
    expect(serializeAssociationDocument({ value: 'x'.repeat(100) })).toMatchObject({ ok: true })
    expect(
      serializeAssociationDocument({ value: 'x'.repeat(MAX_ASSOCIATION_DOCUMENT_BYTES) }),
    ).toMatchObject({ ok: false })
  })
})
