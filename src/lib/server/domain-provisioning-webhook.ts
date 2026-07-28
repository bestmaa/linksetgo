import 'server-only'

import type {
  CertificateProvisioningStatus,
  DomainProvisioningProvider,
  DomainProvisioningResult,
} from '@/lib/application/domain-provisioning-provider'
import type { DomainDNSEvidence } from '@/lib/domain/domain-verification'
import { normalizeHostname } from '@/lib/domain/workspace-domain'

type EnvironmentSource = Readonly<Record<string, string | undefined>>

export type DomainProvisioningWebhookConfiguration =
  | { status: 'disabled' }
  | { message: string; status: 'misconfigured' }
  | { secret: string; status: 'ready'; url: string }

type FetchImplementation = typeof fetch

const maximumResponseBytes = 16 * 1024

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const safeHTTPSURL = (value: string): string | null => {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) return null
    return url.toString()
  } catch {
    return null
  }
}

export function getDomainProvisioningWebhookConfiguration(
  environment: EnvironmentSource = process.env,
): DomainProvisioningWebhookConfiguration {
  const rawURL = environment.DOMAIN_PROVISIONING_WEBHOOK_URL?.trim()
  const secret = environment.DOMAIN_PROVISIONING_WEBHOOK_SECRET?.trim()
  if (!rawURL && !secret) return { status: 'disabled' }
  if (!rawURL || !secret) {
    return {
      message: 'Domain provisioning webhook URL and secret must be configured together.',
      status: 'misconfigured',
    }
  }

  const url = safeHTTPSURL(rawURL)
  if (!url) {
    return {
      message: 'DOMAIN_PROVISIONING_WEBHOOK_URL must be one safe HTTPS URL.',
      status: 'misconfigured',
    }
  }
  if (secret.length < 32) {
    return {
      message: 'DOMAIN_PROVISIONING_WEBHOOK_SECRET must contain at least 32 characters.',
      status: 'misconfigured',
    }
  }

  return { secret, status: 'ready', url }
}

async function readBoundedJSON(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maximumResponseBytes) {
    throw new Error('Domain provider returned an oversized response.')
  }
  if (!response.body) throw new Error('Domain provider returned an empty response.')

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
      throw new Error('Domain provider returned an oversized response.')
    }
    body += decoder.decode(chunk.value, { stream: true })
  }
  body += decoder.decode()
  return JSON.parse(body) as unknown
}

const boundedStrings = (value: unknown, maximumItems: number): string[] | null => {
  if (
    !Array.isArray(value) ||
    value.length > maximumItems ||
    !value.every((item) => typeof item === 'string' && item.length <= 1024)
  ) {
    return null
  }
  return value
}

const optionalInstant = (value: unknown): value is string | null =>
  value === null || (typeof value === 'string' && !Number.isNaN(new Date(value).getTime()))

function parseDNSEvidence(value: unknown): DomainProvisioningResult<DomainDNSEvidence> {
  if (!isRecord(value)) {
    return {
      kind: 'error',
      message: 'Domain provider returned invalid DNS evidence.',
      retryable: true,
    }
  }
  if (value.kind === 'disabled') {
    return { kind: 'disabled', message: 'Automatic DNS inspection is disabled.' }
  }
  if (value.kind === 'error') {
    return {
      kind: 'error',
      message:
        typeof value.message === 'string' && value.message.length <= 500
          ? value.message
          : 'Domain DNS inspection failed.',
      retryable: value.retryable !== false,
    }
  }
  const evidence = isRecord(value.value) ? value.value : null
  const cnameTargets = boundedStrings(evidence?.cnameTargets, 20)
  const txtValues = boundedStrings(evidence?.txtValues, 100)
  return value.kind === 'success' && cnameTargets && txtValues
    ? { kind: 'success', value: { cnameTargets, txtValues } }
    : { kind: 'error', message: 'Domain provider returned invalid DNS evidence.', retryable: true }
}

function parseCertificateStatus(
  value: unknown,
): DomainProvisioningResult<CertificateProvisioningStatus> {
  if (!isRecord(value)) {
    return {
      kind: 'error',
      message: 'Domain provider returned invalid TLS state.',
      retryable: true,
    }
  }
  if (value.kind === 'disabled') {
    return { kind: 'disabled', message: 'Automatic certificate provisioning is disabled.' }
  }
  if (value.kind === 'error') {
    return {
      kind: 'error',
      message:
        typeof value.message === 'string' && value.message.length <= 500
          ? value.message
          : 'Certificate provisioning failed.',
      retryable: value.retryable !== false,
    }
  }
  const state = isRecord(value.value) ? value.value : null
  if (value.kind !== 'success' || !state) {
    return {
      kind: 'error',
      message: 'Domain provider returned invalid TLS state.',
      retryable: true,
    }
  }
  if (state.kind === 'pending') return { kind: 'success', value: { kind: 'pending' } }
  if (state.kind === 'failed' && typeof state.message === 'string' && state.message.length <= 500) {
    return { kind: 'success', value: { kind: 'failed', message: state.message } }
  }
  if (
    state.kind === 'ready' &&
    typeof state.certificateID === 'string' &&
    state.certificateID.length > 0 &&
    state.certificateID.length <= 255 &&
    optionalInstant(state.renewsAt)
  ) {
    return {
      kind: 'success',
      value: {
        certificateID: state.certificateID,
        kind: 'ready',
        renewsAt: state.renewsAt,
      },
    }
  }
  return { kind: 'error', message: 'Domain provider returned invalid TLS state.', retryable: true }
}

export function createWebhookDomainProvisioningProvider(
  configuration: Extract<DomainProvisioningWebhookConfiguration, { status: 'ready' }>,
  fetchImplementation: FetchImplementation = fetch,
): DomainProvisioningProvider {
  const call = async (action: 'inspect-dns' | 'request-certificate', hostname: string) => {
    const normalizedHostname = normalizeHostname(hostname)
    if (!normalizedHostname) {
      return {
        kind: 'error',
        message: 'Domain provisioning received an invalid hostname.',
        retryable: false,
      } as const
    }

    let response: Response
    try {
      response = await fetchImplementation(configuration.url, {
        body: JSON.stringify({ action, hostname: normalizedHostname }),
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
      return {
        kind: 'error',
        message: 'Domain provisioning provider is unavailable.',
        retryable: true,
      } as const
    }
    if (!response.ok) {
      return {
        kind: 'error',
        message: 'Domain provisioning provider rejected the request.',
        retryable: response.status >= 500 || response.status === 429,
      } as const
    }
    try {
      return { kind: 'response', value: await readBoundedJSON(response) } as const
    } catch {
      return {
        kind: 'error',
        message: 'Domain provisioning provider returned an invalid response.',
        retryable: true,
      } as const
    }
  }

  return {
    async inspectDNS(hostname) {
      const response = await call('inspect-dns', hostname)
      return response.kind === 'response' ? parseDNSEvidence(response.value) : response
    },
    async requestCertificate(hostname) {
      const response = await call('request-certificate', hostname)
      return response.kind === 'response' ? parseCertificateStatus(response.value) : response
    },
  }
}
