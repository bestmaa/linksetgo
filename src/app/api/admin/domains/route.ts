import { NextResponse } from 'next/server'

import { isExactObject } from '@/lib/domain/exact-object'
import { readBoundedJSON } from '@/lib/server/bounded-json'
import {
  isActiveConsoleUser,
  listConsoleDomains,
  normalizeConsoleWorkspaceID,
  registerConsoleCustomDomain,
} from '@/lib/server/domain-console'
import { getPayloadClient } from '@/lib/server/payload-client'
import { isSameOriginMutation } from '@/lib/server/same-origin-mutation'

const noStoreHeaders = { 'Cache-Control': 'private, no-store' }
const maximumBodyBytes = 2048

const unauthorized = (): NextResponse =>
  NextResponse.json(
    { error: { code: 'UNAUTHORIZED', message: 'Sign in to manage domains.' } },
    { headers: noStoreHeaders, status: 401 },
  )

const resultResponse = <T>(
  result: { ok: true; value: T } | { code: string; message: string; ok: false; status: number },
  successStatus = 200,
): NextResponse =>
  result.ok
    ? NextResponse.json(result.value, { headers: noStoreHeaders, status: successStatus })
    : NextResponse.json(
        { error: { code: result.code, message: result.message } },
        { headers: noStoreHeaders, status: result.status },
      )

export async function GET(request: Request): Promise<NextResponse> {
  const payload = await getPayloadClient()
  const auth = await payload.auth({ headers: request.headers })
  if (!isActiveConsoleUser(auth.user)) return unauthorized()

  const workspaceID = normalizeConsoleWorkspaceID(
    new URL(request.url).searchParams.get('workspaceId'),
  )
  if (!workspaceID) {
    return NextResponse.json(
      { error: { code: 'INVALID_INPUT', message: 'Select a workspace.' } },
      { headers: noStoreHeaders, status: 400 },
    )
  }

  return resultResponse(await listConsoleDomains(payload, auth.user, workspaceID))
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json(
      { error: { code: 'CROSS_SITE_REQUEST', message: 'This request origin is not allowed.' } },
      { headers: noStoreHeaders, status: 403 },
    )
  }
  const payload = await getPayloadClient()
  const auth = await payload.auth({ headers: request.headers })
  if (!isActiveConsoleUser(auth.user)) return unauthorized()

  const parsed = await readBoundedJSON(request, maximumBodyBytes)
  if (!parsed.ok) {
    return NextResponse.json(
      { error: { code: 'INVALID_INPUT', message: parsed.message } },
      { headers: noStoreHeaders, status: parsed.status },
    )
  }
  const input = parsed.value
  if (!isExactObject(input, ['hostname', 'workspaceId'])) {
    return NextResponse.json(
      { error: { code: 'INVALID_INPUT', message: 'Enter one valid custom domain.' } },
      { headers: noStoreHeaders, status: 400 },
    )
  }
  const record = input
  const hostname = Object.hasOwn(record, 'hostname') ? record.hostname : null
  const workspaceID = Object.hasOwn(record, 'workspaceId') ? record.workspaceId : null

  return resultResponse(
    await registerConsoleCustomDomain(payload, auth.user, { hostname, workspaceID }),
    201,
  )
}
