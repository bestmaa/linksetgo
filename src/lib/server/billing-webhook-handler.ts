import 'server-only'

import type { Payload } from 'payload'

import type { BillingProviderConfiguration } from './billing-provider-registry'
import { getBillingProviderConfiguration } from './billing-provider-registry'
import { processBillingWebhook } from './billing-webhook'
import { getRelayEdition } from './deployment-edition'
import { getPayloadClient } from './payload-client'

export const MAX_BILLING_WEBHOOK_BYTES = 65_536

type BillingWebhookHandlerOptions = {
  getConfiguration?: () => BillingProviderConfiguration
  getPayload?: () => Promise<Payload>
}

type RawBodyResult =
  { kind: 'invalid' } | { kind: 'success'; value: Uint8Array } | { kind: 'too-large' }

async function readRawBody(request: Request): Promise<RawBodyResult> {
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_BILLING_WEBHOOK_BYTES) {
    return { kind: 'too-large' }
  }
  if (!request.body) return { kind: 'invalid' }

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    size += chunk.value.byteLength
    if (size > MAX_BILLING_WEBHOOK_BYTES) {
      await reader.cancel()
      return { kind: 'too-large' }
    }
    chunks.push(chunk.value)
  }
  if (size === 0) return { kind: 'invalid' }

  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { kind: 'success', value: body }
}

const json = (status: number, body: Record<string, unknown>, headers?: HeadersInit): Response =>
  Response.json(body, headers ? { headers, status } : { status })

export function createBillingWebhookHandler(
  options: BillingWebhookHandlerOptions = {},
): (request: Request) => Promise<Response> {
  return async (request) => {
    if (getRelayEdition() !== 'cloud') {
      return json(404, { status: 'unavailable' })
    }

    const configuration = (options.getConfiguration ?? getBillingProviderConfiguration)()
    if (!configuration.configured) {
      return json(
        503,
        { status: 'unavailable', error: { code: 'BILLING_NOT_CONFIGURED' } },
        { 'Retry-After': '300' },
      )
    }

    const body = await readRawBody(request)
    if (body.kind === 'too-large') {
      return json(413, { status: 'unavailable', error: { code: 'PAYLOAD_TOO_LARGE' } })
    }
    if (body.kind === 'invalid') {
      return json(400, { status: 'unavailable', error: { code: 'INVALID_BODY' } })
    }

    const outcome = await processBillingWebhook({
      payload: await (options.getPayload ?? getPayloadClient)(),
      provider: configuration.provider,
      providerKey: configuration.key,
      request: {
        body: body.value,
        headers: Object.fromEntries(request.headers.entries()),
      },
    })

    switch (outcome.kind) {
      case 'applied':
      case 'duplicate':
      case 'stale':
        return json(200, { status: 'accepted', outcome: outcome.kind })
      case 'disabled':
        return json(503, { status: 'unavailable', error: { code: 'BILLING_DISABLED' } })
      case 'error':
        return json(
          outcome.retryable ? 503 : 400,
          { status: 'unavailable', error: { code: 'WEBHOOK_REJECTED' } },
          outcome.retryable ? { 'Retry-After': '60' } : undefined,
        )
    }
  }
}
