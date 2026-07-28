import { NextResponse } from 'next/server'

import { isActiveConsoleUser, normalizeConsoleWorkspaceID } from '@/lib/server/domain-console'
import {
  getConsoleFallbackOriginInstructions,
  normalizeFallbackOriginID,
} from '@/lib/server/fallback-origin-console'
import { getPayloadClient } from '@/lib/server/payload-client'

type RouteContext = {
  params: Promise<{ originId: string }>
}

const headers = { 'Cache-Control': 'private, no-store' }

export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  const payload = await getPayloadClient()
  const auth = await payload.auth({ headers: request.headers })
  if (!isActiveConsoleUser(auth.user)) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Sign in to view fallback-origin setup.' } },
      { headers, status: 401 },
    )
  }

  const { originId } = await context.params
  const id = normalizeFallbackOriginID(originId)
  const workspaceID = normalizeConsoleWorkspaceID(
    new URL(request.url).searchParams.get('workspaceId'),
  )
  if (!id || !workspaceID) {
    return NextResponse.json(
      { error: { code: 'INVALID_INPUT', message: 'Select a fallback origin and workspace.' } },
      { headers, status: 400 },
    )
  }

  const result = await getConsoleFallbackOriginInstructions({
    id,
    payload,
    user: auth.user,
    workspaceID,
  })
  return result.ok
    ? NextResponse.json(result.value, { headers })
    : NextResponse.json(
        { error: { code: result.code, message: result.message } },
        { headers, status: result.status },
      )
}
