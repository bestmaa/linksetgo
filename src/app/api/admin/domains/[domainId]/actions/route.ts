import { NextResponse } from 'next/server'

import { parseDomainActionInput } from '@/lib/domain/domain-action-input'
import { readBoundedJSON } from '@/lib/server/bounded-json'
import { rateLimitDomainAction } from '@/lib/server/domain-action-rate-limit'
import {
  isActiveConsoleUser,
  normalizeConsoleWorkspaceID,
  projectConsoleDomain,
} from '@/lib/server/domain-console'
import { getDomainProvisioningProviderConfiguration } from '@/lib/server/domain-provisioning-provider-registry'
import type { DomainActionResult } from '@/lib/server/domain-provisioning-result'
import { runCustomDomainProvisioning } from '@/lib/server/domain-provisioning-runner'
import { confirmCustomDomainRelease } from '@/lib/server/domain-release-confirmation'
import { getServerEnvironment } from '@/lib/server/env'
import { getPayloadClient } from '@/lib/server/payload-client'
import { isSameOriginMutation } from '@/lib/server/same-origin-mutation'

type RouteContext = {
  params: Promise<{ domainId: string }>
}

const noStoreHeaders = { 'Cache-Control': 'private, no-store' }

function actionResponse(result: DomainActionResult): NextResponse {
  const headers: Record<string, string> = { ...noStoreHeaders }
  if (!result.ok && result.retryAfterSeconds) {
    headers['Retry-After'] = String(result.retryAfterSeconds)
  }
  return result.ok
    ? NextResponse.json(
        {
          domain: projectConsoleDomain(result.domain),
          message: result.message,
          stage: result.stage,
        },
        { headers },
      )
    : NextResponse.json(
        {
          error: { code: result.code, message: result.message },
          ...(result.domain ? { domain: projectConsoleDomain(result.domain) } : {}),
        },
        { headers, status: result.status },
      )
}

export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json(
      { error: { code: 'CROSS_SITE_REQUEST', message: 'This request origin is not allowed.' } },
      { headers: noStoreHeaders, status: 403 },
    )
  }
  const payload = await getPayloadClient()
  const auth = await payload.auth({ headers: request.headers })
  if (!isActiveConsoleUser(auth.user)) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Sign in to manage domains.' } },
      { headers: noStoreHeaders, status: 401 },
    )
  }

  const { domainId } = await context.params
  const safeDomainID = normalizeConsoleWorkspaceID(domainId)
  const body = await readBoundedJSON(request, 2_048)
  const input = body.ok ? parseDomainActionInput(body.value) : null
  if (!safeDomainID || !body.ok || !input) {
    return NextResponse.json(
      { error: { code: 'INVALID_INPUT', message: 'Select one valid domain action.' } },
      { headers: noStoreHeaders, status: body.ok ? 400 : body.status },
    )
  }

  const limit = await rateLimitDomainAction({
    actorID: String(auth.user.id),
    domainID: safeDomainID,
    eventHashSecret: getServerEnvironment().eventHashSecret,
  })
  if (!limit.allowed) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((new Date(limit.resetAt).getTime() - Date.now()) / 1_000),
    )
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many domain actions. Try again later.' } },
      {
        headers: { ...noStoreHeaders, 'Retry-After': String(retryAfterSeconds) },
        status: 429,
      },
    )
  }

  if (input.action === 'confirm-associations') {
    return actionResponse(
      await confirmCustomDomainRelease({
        confirmedHostname: input.confirmedHostname,
        domainID: safeDomainID,
        payload,
        user: auth.user,
        workspaceID: input.workspaceID,
      }),
    )
  }

  const configuration = getDomainProvisioningProviderConfiguration()
  return actionResponse(
    await runCustomDomainProvisioning({
      domainID: safeDomainID,
      payload,
      provider: configuration.provider,
      user: auth.user,
      workspaceID: input.workspaceID,
    }),
  )
}
