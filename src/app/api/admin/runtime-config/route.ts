import { NextResponse } from 'next/server'

import { isActiveConsoleUser } from '@/lib/server/domain-console'
import { getPayloadClient } from '@/lib/server/payload-client'
import { getRuntimeLinkConfig, normalizeRuntimeWorkspaceID } from '@/lib/server/runtime-link-config'

const noStoreHeaders = { 'Cache-Control': 'private, no-store' }

const errorResponse = (code: string, message: string, status: number): NextResponse =>
  NextResponse.json({ error: { code, message } }, { headers: noStoreHeaders, status })

export async function GET(request: Request): Promise<NextResponse> {
  const payload = await getPayloadClient()
  const auth = await payload.auth({ headers: request.headers })
  if (!isActiveConsoleUser(auth.user)) {
    return errorResponse('UNAUTHORIZED', 'Sign in to load workspace settings.', 401)
  }

  const workspaceID = normalizeRuntimeWorkspaceID(
    new URL(request.url).searchParams.get('workspaceId'),
  )
  if (!workspaceID) {
    return errorResponse('INVALID_INPUT', 'Select a workspace.', 400)
  }

  const result = await getRuntimeLinkConfig(payload, auth.user, workspaceID)
  return result.ok
    ? NextResponse.json(result.value, { headers: noStoreHeaders })
    : errorResponse(result.code, result.message, result.status)
}
