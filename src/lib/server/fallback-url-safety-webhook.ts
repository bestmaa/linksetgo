import 'server-only'

import type {
  URLSafetyProvider,
  URLSafetyProviderResult,
} from '@/lib/application/url-safety-provider'
import {
  canonicalizeFallbackURL,
  fallbackURLThreats,
  type FallbackURLThreat,
} from '@/lib/domain/fallback-url-safety'
import {
  createGoogleWebRiskURLSafetyProvider,
  getGoogleWebRiskConfiguration,
} from './google-web-risk-url-safety-provider'

type EnvironmentSource = Readonly<Record<string, string | undefined>>
type FetchImplementation = typeof fetch

export type FallbackURLSafetyWebhookConfiguration =
  | { status: 'disabled' }
  | { message: string; status: 'misconfigured' }
  | {
      maxAgeMs: number
      secret: string
      status: 'ready'
      url: string
    }

export type FallbackURLSafetyProviderConfiguration =
  | {
      available: true
      maxAgeMs: number
      provider: URLSafetyProvider
    }
  | {
      available: false
      message: string
      provider: null
    }

const maximumResponseBytes = 16 * 1024
const defaultMaxAgeSeconds = 60 * 60
const minimumMaxAgeSeconds = 5 * 60
const maximumMaxAgeSeconds = 7 * 24 * 60 * 60

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function safeWebhookURL(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) return null
    return url.toString()
  } catch {
    return null
  }
}

function maxAgeMilliseconds(value: string | undefined): number | null {
  if (!value?.trim()) return defaultMaxAgeSeconds * 1_000
  const seconds = Number(value)
  return Number.isSafeInteger(seconds) &&
    seconds >= minimumMaxAgeSeconds &&
    seconds <= maximumMaxAgeSeconds
    ? seconds * 1_000
    : null
}

export function getFallbackURLSafetyWebhookConfiguration(
  environment: EnvironmentSource = process.env,
): FallbackURLSafetyWebhookConfiguration {
  const rawURL = environment.FALLBACK_URL_SAFETY_WEBHOOK_URL?.trim()
  const secret = environment.FALLBACK_URL_SAFETY_WEBHOOK_SECRET?.trim()
  if (!rawURL && !secret) return { status: 'disabled' }
  if (!rawURL || !secret) {
    return {
      message: 'Fallback URL safety webhook URL and secret must be configured together.',
      status: 'misconfigured',
    }
  }

  const url = safeWebhookURL(rawURL)
  if (!url) {
    return {
      message: 'FALLBACK_URL_SAFETY_WEBHOOK_URL must be one safe HTTPS URL.',
      status: 'misconfigured',
    }
  }
  if (secret.length < 32) {
    return {
      message: 'FALLBACK_URL_SAFETY_WEBHOOK_SECRET must contain at least 32 characters.',
      status: 'misconfigured',
    }
  }
  const maxAgeMs = maxAgeMilliseconds(environment.FALLBACK_URL_SAFETY_MAX_AGE_SECONDS)
  if (maxAgeMs === null) {
    return {
      message: 'FALLBACK_URL_SAFETY_MAX_AGE_SECONDS must be between 300 and 604800 seconds.',
      status: 'misconfigured',
    }
  }
  return { maxAgeMs, secret, status: 'ready', url }
}

async function readBoundedJSON(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maximumResponseBytes) {
    throw new Error('URL safety provider returned too much data.')
  }
  if (!response.body) throw new Error('URL safety provider returned no data.')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let body = ''
  let bytesRead = 0
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    bytesRead += chunk.value.byteLength
    if (bytesRead > maximumResponseBytes) {
      await reader.cancel()
      throw new Error('URL safety provider returned too much data.')
    }
    body += decoder.decode(chunk.value, { stream: true })
  }
  body += decoder.decode()
  return JSON.parse(body) as unknown
}

function boundedMessage(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() && value.length <= 500 ? value.trim() : fallback
}

function observation(
  value: unknown,
): null | { expiresAt?: string; observedAt: string; redirectCount: number } {
  if (!isRecord(value)) return null
  const observedAt = value.observedAt
  const redirectCount = value.redirectCount
  if (
    typeof observedAt !== 'string' ||
    !Number.isFinite(Date.parse(observedAt)) ||
    !Number.isSafeInteger(redirectCount) ||
    (redirectCount as number) < 0 ||
    (redirectCount as number) > 10
  ) {
    return null
  }
  const expiresAt = value.expiresAt
  if (
    expiresAt !== undefined &&
    (typeof expiresAt !== 'string' || !Number.isFinite(Date.parse(expiresAt)))
  ) {
    return null
  }
  return {
    ...(typeof expiresAt === 'string' ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
    observedAt: new Date(observedAt).toISOString(),
    redirectCount: redirectCount as number,
  }
}

function threats(value: unknown): FallbackURLThreat[] | null {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > fallbackURLThreats.length ||
    !value.every(
      (item): item is FallbackURLThreat =>
        typeof item === 'string' && fallbackURLThreats.includes(item as FallbackURLThreat),
    )
  ) {
    return null
  }
  return [...new Set(value)]
}

function parseProviderResult(value: unknown): URLSafetyProviderResult | null {
  if (!isRecord(value) || typeof value.kind !== 'string') return null
  if (value.kind === 'error') {
    return {
      kind: 'error',
      message: boundedMessage(value.message, 'The URL safety provider could not assess this URL.'),
      retryable: value.retryable !== false,
    }
  }
  const details = observation(value.value)
  if (!details) return null
  if (value.kind === 'safe') return { kind: 'safe', ...details }
  if (value.kind !== 'unsafe' || !isRecord(value.value)) return null
  const detectedThreats = threats(value.value.threats)
  return detectedThreats ? { kind: 'unsafe', ...details, threats: detectedThreats } : null
}

type ReadyConfiguration = Extract<FallbackURLSafetyWebhookConfiguration, { status: 'ready' }>

export function createWebhookFallbackURLSafetyProvider(
  configuration: ReadyConfiguration,
  fetchImplementation: FetchImplementation = fetch,
): URLSafetyProvider {
  return {
    async assessURL(value) {
      const fallbackURL = canonicalizeFallbackURL(value)
      if (!fallbackURL.ok || fallbackURL.value.canonicalUrl !== value) {
        return {
          kind: 'error',
          message: 'The URL safety provider received a non-canonical fallback URL.',
          retryable: false,
        }
      }

      let response: Response
      try {
        // The only network call targets the fixed operator-configured webhook.
        // A scanner may inspect the tenant URL in an egress-sandboxed service;
        // this Next/Payload process never connects to it.
        response = await fetchImplementation(configuration.url, {
          body: JSON.stringify({
            action: 'assess-url',
            url: fallbackURL.value.canonicalUrl,
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
        return {
          kind: 'error',
          message: 'The URL safety provider is unavailable.',
          retryable: true,
        }
      }
      if (!response.ok) {
        return {
          kind: 'error',
          message: 'The URL safety provider rejected the request.',
          retryable: response.status === 429 || response.status >= 500,
        }
      }

      try {
        return (
          parseProviderResult(await readBoundedJSON(response)) ?? {
            kind: 'error',
            message: 'The URL safety provider returned invalid data.',
            retryable: true,
          }
        )
      } catch {
        return {
          kind: 'error',
          message: 'The URL safety provider returned invalid data.',
          retryable: true,
        }
      }
    },
  }
}

export function getFallbackURLSafetyProviderConfiguration(
  environment: EnvironmentSource = process.env,
  fetchImplementation: FetchImplementation = fetch,
): FallbackURLSafetyProviderConfiguration {
  const google = getGoogleWebRiskConfiguration(environment)
  if (google.status === 'misconfigured') {
    return { available: false, message: google.message, provider: null }
  }

  const configuration = getFallbackURLSafetyWebhookConfiguration(environment)
  if (configuration.status !== 'ready') {
    return {
      available: false,
      message:
        configuration.status === 'misconfigured'
          ? configuration.message
          : google.status === 'ready'
            ? 'Google Web Risk is only a reputation signal. Configure the sandboxed fallback URL scanner as well.'
            : 'Automatic fallback URL safety checks are not configured.',
      provider: null,
    }
  }

  const scanner = createWebhookFallbackURLSafetyProvider(configuration, fetchImplementation)
  if (google.status === 'disabled') {
    return { available: true, maxAgeMs: configuration.maxAgeMs, provider: scanner }
  }

  const reputation = createGoogleWebRiskURLSafetyProvider(google.apiKey, fetchImplementation)
  return {
    available: true,
    maxAgeMs: configuration.maxAgeMs,
    provider: {
      async assessURL(value) {
        const reputationResult = await reputation.assessURL(value)
        if (reputationResult.kind !== 'safe') return reputationResult
        // A reputation miss is not a safe verdict. The egress-sandboxed
        // scanner must independently inspect the redirect chain and content.
        return scanner.assessURL(value)
      },
    },
  }
}
