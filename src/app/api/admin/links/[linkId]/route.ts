import { NextResponse } from 'next/server'

import { readBoundedJSON } from '@/lib/server/bounded-json'
import {
  isActiveAppConsoleUser,
  normalizeConsoleAppIdentifier,
} from '@/lib/server/app-console-input'
import { getConsoleLinkDetail, mutateConsoleLink } from '@/lib/server/link-console'
import { parseLinkConsoleMutation } from '@/lib/server/link-console-input'
import { getPayloadClient } from '@/lib/server/payload-client'
import { isSameOriginMutation } from '@/lib/server/same-origin-mutation'

type RouteContext = {
  params: Promise<{ linkId: string }>
}

const noStoreHeaders = { 'Cache-Control': 'private, no-store' }

const unauthorized = (): NextResponse =>
  NextResponse.json(
    { error: { code: 'UNAUTHORIZED', message: 'Sign in to manage links.' } },
    { headers: noStoreHeaders, status: 401 },
  )

const resultResponse = <T>(
  result: { ok: true; value: T } | { code: string; message: string; ok: false; status: number },
): NextResponse =>
  result.ok
    ? NextResponse.json(result.value, { headers: noStoreHeaders })
    : NextResponse.json(
        { error: { code: result.code, message: result.message } },
        { headers: noStoreHeaders, status: result.status },
      )

export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  const payload = await getPayloadClient()
  const auth = await payload.auth({ headers: request.headers })
  if (!isActiveAppConsoleUser(auth.user)) return unauthorized()

  const { linkId } = await context.params
  const safeLinkID = normalizeConsoleAppIdentifier(linkId)
  const workspaceID = normalizeConsoleAppIdentifier(
    new URL(request.url).searchParams.get('workspaceId'),
  )
  if (!safeLinkID || !workspaceID) {
    return NextResponse.json(
      { error: { code: 'INVALID_INPUT', message: 'Select a valid link and workspace.' } },
      { headers: noStoreHeaders, status: 400 },
    )
  }
  return resultResponse(await getConsoleLinkDetail(payload, auth.user, safeLinkID, workspaceID))
}

export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json(
      {
        error: {
          code: 'CROSS_SITE_REQUEST',
          message: 'This request origin is not allowed.',
        },
      },
      { headers: noStoreHeaders, status: 403 },
    )
  }
  const payload = await getPayloadClient()
  const auth = await payload.auth({ headers: request.headers })
  if (!isActiveAppConsoleUser(auth.user)) return unauthorized()

  const { linkId } = await context.params
  const safeLinkID = normalizeConsoleAppIdentifier(linkId)
  const body = await readBoundedJSON(request, 16_384)
  if (!safeLinkID || !body.ok) {
    const message = body.ok ? 'Select a valid link.' : body.message
    const status = body.ok ? 400 : body.status
    return NextResponse.json(
      { error: { code: 'INVALID_INPUT', message } },
      { headers: noStoreHeaders, status },
    )
  }

  const input = parseLinkConsoleMutation(body.value)
  if (!input.ok) {
    return NextResponse.json(
      { error: { code: 'INVALID_INPUT', message: input.message } },
      { headers: noStoreHeaders, status: 400 },
    )
  }
  return resultResponse(await mutateConsoleLink(payload, auth.user, safeLinkID, input.value))
}
