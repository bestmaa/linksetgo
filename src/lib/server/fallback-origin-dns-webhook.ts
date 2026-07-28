import 'server-only'

import type {
  DNSOwnershipEvidenceProvider,
  TXTEvidence,
} from '@/lib/application/dns-evidence-provider'
import { normalizeFallbackOriginHostname } from '@/lib/domain/fallback-origin'

import {
  getDomainProvisioningWebhookConfiguration,
  type DomainProvisioningWebhookConfiguration,
} from './domain-provisioning-webhook'

type FetchImplementation = typeof fetch
type ReadyWebhookConfiguration = Extract<
  DomainProvisioningWebhookConfiguration,
  { status: 'ready' }
>

const maximumResponseBytes = 16 * 1024
const recordPrefix = '_relay-fallback.'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function normalizeTXTRecordName(value: string): string | null {
  const trimmed = value.trim().toLowerCase().replace(/\.$/, '')
  if (!trimmed.startsWith(recordPrefix)) return null
  const hostname = normalizeFallbackOriginHostname(trimmed.slice(recordPrefix.length))
  return hostname && trimmed === `${recordPrefix}${hostname}` ? trimmed : null
}

async function readBoundedJSON(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maximumResponseBytes) {
    throw new Error('Fallback-origin provider returned too much evidence.')
  }
  if (!response.body) throw new Error('Fallback-origin provider returned no evidence.')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let bytesRead = 0
  let body = ''
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    bytesRead += chunk.value.byteLength
    if (bytesRead > maximumResponseBytes) {
      await reader.cancel()
      throw new Error('Fallback-origin provider returned too much evidence.')
    }
    body += decoder.decode(chunk.value, { stream: true })
  }
  body += decoder.decode()
  return JSON.parse(body) as unknown
}

function parseTXTEvidence(value: unknown): TXTEvidence | null {
  if (!isRecord(value) || value.kind !== 'success' || !isRecord(value.value)) return null
  const observedAt = value.value.observedAt
  const values = value.value.values
  if (
    typeof observedAt !== 'string' ||
    !Number.isFinite(Date.parse(observedAt)) ||
    !Array.isArray(values) ||
    values.length > 50 ||
    !values.every((entry) => typeof entry === 'string' && entry.length <= 1_024) ||
    values.reduce((total, entry) => total + entry.length, 0) > 16_384
  ) {
    return null
  }
  return { observedAt: new Date(observedAt).toISOString(), values }
}

export function createWebhookFallbackOriginDNSProvider(
  configuration: ReadyWebhookConfiguration,
  fetchImplementation: FetchImplementation = fetch,
): DNSOwnershipEvidenceProvider {
  return {
    async lookupTXT(recordName) {
      const normalizedRecordName = normalizeTXTRecordName(recordName)
      if (!normalizedRecordName) {
        throw new Error('Fallback-origin verification received an invalid TXT record name.')
      }

      let response: Response
      try {
        response = await fetchImplementation(configuration.url, {
          body: JSON.stringify({
            action: 'lookup-txt',
            recordName: normalizedRecordName,
          }),
          headers: {
            accept: 'application/json',
            authorization: `Bearer ${configuration.secret}`,
            'content-type': 'application/json',
          },
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(8_000),
        })
      } catch {
        throw new Error('Fallback-origin DNS provider is unavailable.')
      }
      if (!response.ok) throw new Error('Fallback-origin DNS provider rejected the request.')

      let evidence: TXTEvidence | null = null
      try {
        evidence = parseTXTEvidence(await readBoundedJSON(response))
      } catch {
        // Normalize parsing and transport details into one operator-safe error.
      }
      if (!evidence) throw new Error('Fallback-origin DNS provider returned invalid evidence.')
      return evidence
    },
  }
}

export type FallbackOriginDNSProviderConfiguration =
  | {
      available: true
      provider: DNSOwnershipEvidenceProvider
    }
  | {
      available: false
      message: string
      provider: null
    }

export function getFallbackOriginDNSProviderConfiguration(): FallbackOriginDNSProviderConfiguration {
  const webhook = getDomainProvisioningWebhookConfiguration()
  if (webhook.status === 'ready') {
    return {
      available: true,
      provider: createWebhookFallbackOriginDNSProvider(webhook),
    }
  }
  return {
    available: false,
    message:
      webhook.status === 'misconfigured'
        ? webhook.message
        : 'Automatic fallback-origin TXT verification is not configured.',
    provider: null,
  }
}
