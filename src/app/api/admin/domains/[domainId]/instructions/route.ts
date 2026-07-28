import { NextResponse } from 'next/server'

import {
  getConsoleDomainInstructions,
  isActiveConsoleUser,
  normalizeConsoleWorkspaceID,
} from '@/lib/server/domain-console'
import { getPayloadClient } from '@/lib/server/payload-client'

type RouteContext = {
  params: Promise<{ domainId: string }>
}

const noStoreHeaders = { 'Cache-Control': 'private, no-store' }

export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  const payload = await getPayloadClient()
  const auth = await payload.auth({ headers: request.headers })
  if (!isActiveConsoleUser(auth.user)) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Sign in to view domain instructions.' } },
      { headers: noStoreHeaders, status: 401 },
    )
  }

  const { domainId } = await context.params
  const safeDomainID = normalizeConsoleWorkspaceID(domainId)
  const workspaceID = normalizeConsoleWorkspaceID(
    new URL(request.url).searchParams.get('workspaceId'),
  )
  if (!safeDomainID || !workspaceID) {
    return NextResponse.json(
      { error: { code: 'INVALID_INPUT', message: 'Select a valid domain and workspace.' } },
      { headers: noStoreHeaders, status: 400 },
    )
  }

  const result = await getConsoleDomainInstructions(payload, auth.user, safeDomainID, workspaceID)
  return result.ok
    ? NextResponse.json(result.value, { headers: noStoreHeaders })
    : NextResponse.json(
        { error: { code: result.code, message: result.message } },
        { headers: noStoreHeaders, status: result.status },
      )
}
