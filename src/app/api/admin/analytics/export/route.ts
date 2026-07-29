import { NextResponse } from 'next/server'

import { analyticsSummaryCSV } from '@/lib/server/analytics-csv'
import { analyticsQueryFromURL } from '@/lib/server/analytics-request'
import { getAnalyticsSummary } from '@/lib/server/analytics-summary'
import { isActiveAppConsoleUser } from '@/lib/server/app-console-input'
import { getPayloadClient } from '@/lib/server/payload-client'

const noStoreHeaders = { 'Cache-Control': 'private, no-store' }

export async function GET(request: Request): Promise<NextResponse> {
  const payload = await getPayloadClient()
  const auth = await payload.auth({ headers: request.headers })
  if (!isActiveAppConsoleUser(auth.user)) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Sign in to export analytics.' } },
      { headers: noStoreHeaders, status: 401 },
    )
  }
  const query = analyticsQueryFromURL(request.url)
  if (!query) {
    return NextResponse.json(
      { error: { code: 'INVALID_INPUT', message: 'Choose a valid analytics workspace.' } },
      { headers: noStoreHeaders, status: 400 },
    )
  }
  const result = await getAnalyticsSummary(payload, auth.user, query)
  if (!result.ok) {
    return NextResponse.json(
      { error: { code: result.code, message: result.message } },
      { headers: noStoreHeaders, status: result.status },
    )
  }
  return new NextResponse(analyticsSummaryCSV(result.value), {
    headers: {
      ...noStoreHeaders,
      'Content-Disposition': 'attachment; filename="linksetgo-analytics.csv"',
      'Content-Type': 'text/csv; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
