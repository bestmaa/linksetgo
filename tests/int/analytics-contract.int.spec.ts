import { describe, expect, it } from 'vitest'

import type { AnalyticsSummaryDTO } from '@/lib/client/payload-types'
import { analyticsSummaryCSV, safeCSVCell } from '@/lib/server/analytics-csv'
import {
  communityAnalyticsRetentionDays,
  DEFAULT_COMMUNITY_ANALYTICS_RETENTION_DAYS,
  MAX_ANALYTICS_RETENTION_DAYS,
} from '@/lib/server/analytics-retention'
import { analyticsQueryFromURL } from '@/lib/server/analytics-request'

const summary: AnalyticsSummaryDTO = {
  apps: [{ count: 3, id: '1', label: '=FORMULA()' }],
  daily: [{ count: 3, date: '2026-07-27' }],
  events: [{ count: 2, id: 'resolved', label: 'Resolved' }],
  hosts: [{ count: 3, id: 'links.example', label: 'links.example' }],
  links: [{ count: 3, id: '2', label: 'Welcome, "friend"' }],
  platforms: [{ count: 3, id: 'ios', label: 'iOS' }],
  range: {
    from: '2026-07-21',
    retentionDays: 30,
    retentionStartsAt: '2026-06-28',
    to: '2026-07-27',
    wasClamped: false,
  },
  totalEvents: 3,
}

describe('analytics public contracts', () => {
  it('parses only the documented aggregate query keys', () => {
    expect(
      analyticsQueryFromURL(
        'https://relay.example/api/admin/analytics?workspaceId=12&appId=7&platform=ios',
      ),
    ).toEqual({ appId: '7', platform: 'ios', workspaceId: '12' })
    expect(
      analyticsQueryFromURL(
        'https://relay.example/api/admin/analytics?workspaceId=12&rawSession=true',
      ),
    ).toBeNull()
    expect(analyticsQueryFromURL('https://relay.example/api/admin/analytics')).toBeNull()
  })

  it('uses a finite Community retention policy and rejects unsafe configuration', () => {
    expect(communityAnalyticsRetentionDays(undefined)).toBe(
      DEFAULT_COMMUNITY_ANALYTICS_RETENTION_DAYS,
    )
    expect(communityAnalyticsRetentionDays('365')).toBe(365)
    expect(() => communityAnalyticsRetentionDays('0')).toThrow(/integer/)
    expect(() => communityAnalyticsRetentionDays(String(MAX_ANALYTICS_RETENTION_DAYS + 1))).toThrow(
      /integer/,
    )
  })

  it('exports bounded aggregates with spreadsheet-formula protection', () => {
    const csv = analyticsSummaryCSV(summary)

    expect(safeCSVCell('=HYPERLINK("https://evil.example")').startsWith('"\'=')).toBe(true)
    expect(csv).toContain('"\'=FORMULA()"')
    expect(csv).toContain('"Welcome, ""friend"""')
    expect(csv).toContain('"total","all","All events","3"')
    expect(csv).not.toContain('sessionHash')
    expect(csv).not.toContain('userAgent')
    expect(csv).not.toContain('referrer')
  })
})
