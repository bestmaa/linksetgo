import { NextResponse } from 'next/server'

import { isActiveConsoleUser, normalizeConsoleWorkspaceID } from '@/lib/server/domain-console'
import { getBillingSummary } from '@/lib/server/billing-summary'
import { getPayloadClient } from '@/lib/server/payload-client'

const noStoreHeaders = { 'Cache-Control': 'private, no-store' }

export async function GET(request: Request): Promise<NextResponse> {
  const payload = await getPayloadClient()
  const auth = await payload.auth({ headers: request.headers })
  if (!isActiveConsoleUser(auth.user)) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Sign in to view billing.' } },
      { headers: noStoreHeaders, status: 401 },
    )
  }

  const workspaceID = normalizeConsoleWorkspaceID(
    new URL(request.url).searchParams.get('workspaceId'),
  )
  if (!workspaceID) {
    return NextResponse.json(
      { error: { code: 'INVALID_INPUT', message: 'Select a workspace.' } },
      { headers: noStoreHeaders, status: 400 },
    )
  }

  const summary = await getBillingSummary(payload, auth.user, workspaceID).catch(() => null)
  return summary
    ? NextResponse.json(summary, { headers: noStoreHeaders })
    : NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Billing is unavailable for this workspace.' } },
        { headers: noStoreHeaders, status: 404 },
      )
}
