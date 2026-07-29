import config from '@/payload.config'
import { InMemoryRateLimitProvider } from '@/lib/application/rate-limit-provider'
import { parseAbuseReportInput } from '@/lib/domain/abuse-report'
import {
  rateLimitAbuseReportRequest,
  rateLimitAbuseReportTarget,
} from '@/lib/server/abuse-report-rate-limit'
import { recordPublicAbuseReport } from '@/lib/server/abuse-report-service'
import { getServerEnvironment } from '@/lib/server/env'
import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const hostname = 'reported-resource.invalid'

const request = (forwardedFor = '203.0.113.20'): Request =>
  new Request('https://linksetgo.example/api/public/abuse-reports', {
    headers: {
      'accept-language': 'en',
      'user-agent': 'Relay abuse report test',
      'x-forwarded-for': forwardedFor,
    },
    method: 'POST',
  })

describe.sequential('public abuse-report intake', () => {
  let payload: Payload | undefined

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    await payload.delete({
      collection: 'abuse-reports',
      overrideAccess: true,
      where: { targetHostname: { equals: hostname } },
    })
  })

  afterAll(async () => {
    if (!payload) return
    try {
      await payload.delete({
        collection: 'abuse-reports',
        overrideAccess: true,
        where: { targetHostname: { equals: hostname } },
      })
    } finally {
      await payload.destroy()
    }
  })

  it('accepts only bounded credential-free HTTPS targets', () => {
    expect(
      parseAbuseReportInput({
        category: 'phishing',
        details: 'This link impersonates our customer login page.',
        targetURL: `https://${hostname}/l/shop/offer?secret=discarded`,
      }),
    ).toMatchObject({
      ok: true,
      value: { targetHostname: hostname, targetPath: '/l/shop/offer' },
    })
    expect(
      parseAbuseReportInput({
        category: 'phishing',
        details: 'This should not be accepted as a report target.',
        targetURL: 'https://user:password@example.com/l/app/link',
      }),
    ).toMatchObject({ ok: false })
    expect(
      parseAbuseReportInput({
        category: 'phishing',
        details: 'Unknown input fields are rejected at the public boundary.',
        targetURL: `https://${hostname}/l/shop/offer`,
        workspaceId: 'forged',
      }),
    ).toMatchObject({ ok: false })
  })

  it('rate-limits privacy-safe request and target buckets', async () => {
    const provider = new InMemoryRateLimitProvider(() => 10_000)
    const secret = 'abuse-rate-limit-secret-at-least-32-characters'
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        rateLimitAbuseReportRequest({
          eventHashSecret: secret,
          provider,
          request: request(`198.51.100.${attempt}`),
          trustProxyClientIPHeader: false,
        }),
      ).resolves.toMatchObject({ allowed: true })
    }
    await expect(
      rateLimitAbuseReportRequest({
        eventHashSecret: secret,
        provider,
        request: request('192.0.2.200'),
        trustProxyClientIPHeader: false,
      }),
    ).resolves.toMatchObject({ allowed: false })

    const targetProvider = new InMemoryRateLimitProvider(() => 10_000)
    for (let attempt = 0; attempt < 25; attempt += 1) {
      await rateLimitAbuseReportTarget({
        eventHashSecret: secret,
        hostname,
        provider: targetProvider,
      })
    }
    await expect(
      rateLimitAbuseReportTarget({
        eventHashSecret: secret,
        hostname,
        provider: targetProvider,
      }),
    ).resolves.toMatchObject({ allowed: false })
  })

  it('deduplicates replays and never persists the raw client IP', async () => {
    const parsed = parseAbuseReportInput({
      category: 'malware',
      details: 'The destination attempts to install an unexpected executable.',
      reporterContact: 'security@example.com',
      targetURL: `https://${hostname}/l/shop/malware`,
    })
    if (!parsed.ok) throw new Error('Expected valid abuse fixture.')

    const first = await recordPublicAbuseReport({
      payload: payload!,
      report: parsed.value,
      request: request(),
    })
    const replay = await recordPublicAbuseReport({
      payload: payload!,
      report: parsed.value,
      request: request(),
    })
    expect(first).toEqual({ accepted: true, duplicate: false })
    expect(replay).toEqual({ accepted: true, duplicate: true })

    const reports = await payload!.find({
      collection: 'abuse-reports',
      depth: 0,
      limit: 10,
      overrideAccess: true,
      pagination: false,
      where: { targetHostname: { equals: hostname } },
    })
    expect(reports.totalDocs).toBe(1)
    expect(JSON.stringify(reports.docs[0])).not.toContain('203.0.113.20')
    expect(reports.docs[0]?.reporterKeyHash).toHaveLength(64)
    expect(getServerEnvironment().trustProxyClientIPHeader).toBe(false)
  })
})
