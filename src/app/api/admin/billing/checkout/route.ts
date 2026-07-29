import { NextResponse } from 'next/server'

import { isExactObject } from '@/lib/domain/exact-object'
import { readBoundedJSON } from '@/lib/server/bounded-json'
import { createOrganizationCheckout } from '@/lib/server/billing-checkout'
import { getBillingProviderConfiguration } from '@/lib/server/billing-provider-registry'
import { isActiveConsoleUser } from '@/lib/server/domain-console'
import { getRelayEdition } from '@/lib/server/deployment-edition'
import { getPayloadClient } from '@/lib/server/payload-client'
import { isSameOriginMutation } from '@/lib/server/same-origin-mutation'
import { getApplicationSiteURL } from '@/lib/server/site-url'

const noStoreHeaders = { 'Cache-Control': 'private, no-store' }

export async function POST(request: Request): Promise<NextResponse> {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json(
      { error: { code: 'CROSS_SITE_REQUEST', message: 'This request origin is not allowed.' } },
      { headers: noStoreHeaders, status: 403 },
    )
  }
  if (getRelayEdition() !== 'cloud') {
    return NextResponse.json({ status: 'unavailable' }, { status: 404 })
  }
  const configuration = getBillingProviderConfiguration()
  if (!configuration.configured) {
    return NextResponse.json(
      { error: { code: 'BILLING_NOT_CONFIGURED', message: 'Billing is unavailable.' } },
      { headers: { ...noStoreHeaders, 'Retry-After': '300' }, status: 503 },
    )
  }

  const payload = await getPayloadClient()
  const auth = await payload.auth({ headers: request.headers })
  if (!isActiveConsoleUser(auth.user)) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Sign in to change plans.' } },
      { headers: noStoreHeaders, status: 401 },
    )
  }

  const body = await readBoundedJSON(request, 2048)
  const value = body.ok && isExactObject(body.value, ['plan', 'workspaceId']) ? body.value : null
  const hasOnlyAllowedKeys =
    value && Object.keys(value).every((key) => key === 'plan' || key === 'workspaceId')
  const workspaceID = typeof value?.workspaceId === 'string' ? value.workspaceId : ''
  const plan = value?.plan === 'starter' || value?.plan === 'pro' ? value.plan : null
  if (!body.ok || !plan || !hasOnlyAllowedKeys) {
    return NextResponse.json(
      { error: { code: 'INVALID_INPUT', message: 'Select Starter or Pro.' } },
      { headers: noStoreHeaders, status: body.ok ? 400 : body.status },
    )
  }

  const outcome = await createOrganizationCheckout({
    appBaseURL: getApplicationSiteURL().origin,
    payload,
    plan,
    provider: configuration.provider,
    user: auth.user,
    workspaceID,
  })
  if (outcome.kind === 'success') {
    return NextResponse.json(outcome, { headers: noStoreHeaders })
  }
  const status = (() => {
    switch (outcome.kind) {
      case 'forbidden':
        return 403
      case 'invalid':
        return 400
      case 'disabled':
        return 503
      case 'error':
        return outcome.retryable ? 503 : 400
    }
  })()
  return NextResponse.json(
    { error: { code: 'CHECKOUT_UNAVAILABLE', message: outcome.message } },
    { headers: noStoreHeaders, status },
  )
}
