import { NextResponse } from 'next/server'

import { normalizeTeamIdentifier } from '@/lib/domain/team-invitations'
import { getTeamConsole } from '@/lib/server/team-console'
import { getPayloadClient } from '@/lib/server/payload-client'
import { isActiveTeamUser } from '@/lib/server/team-service-shared'

const headers = { 'cache-control': 'private, no-store' }

export async function GET(request: Request): Promise<NextResponse> {
  const payload = await getPayloadClient()
  const auth = await payload.auth({ headers: request.headers })
  if (!isActiveTeamUser(auth.user)) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Sign in to view this team.' } },
      { headers, status: 401 },
    )
  }

  const organizationID = normalizeTeamIdentifier(
    new URL(request.url).searchParams.get('organizationId'),
  )
  if (!organizationID) {
    return NextResponse.json(
      { error: { code: 'INVALID_INPUT', message: 'Select an organization.' } },
      { headers, status: 400 },
    )
  }

  const result = await getTeamConsole(payload, auth.user, organizationID)
  return result.ok
    ? NextResponse.json(result.value, { headers })
    : NextResponse.json(
        { error: { code: result.code, message: result.message } },
        { headers, status: result.status },
      )
}
