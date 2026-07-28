import { NextResponse } from 'next/server'

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
      { error: { code: 'UNAUTHORIZED', message: 'Sign in to view analytics.' } },
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
  return result.ok
    ? NextResponse.json(result.value, { headers: noStoreHeaders })
    : NextResponse.json(
        { error: { code: result.code, message: result.message } },
        { headers: noStoreHeaders, status: result.status },
      )
}
