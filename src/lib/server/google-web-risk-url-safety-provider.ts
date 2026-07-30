import 'server-only'

import type {
  URLSafetyProvider,
  URLSafetyProviderResult,
} from '@/lib/application/url-safety-provider'
import { canonicalizeFallbackURL, type FallbackURLThreat } from '@/lib/domain/fallback-url-safety'

type FetchImplementation = typeof fetch

export type GoogleWebRiskConfiguration =
  | { status: 'disabled' }
  | { message: string; status: 'misconfigured' }
  | { apiKey: string; status: 'ready' }

const endpoint = 'https://webrisk.googleapis.com/v1/uris:search'
const maximumResponseBytes = 16 * 1024
const requestedThreatTypes = ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE'] as const
const threatMapping: Readonly<Record<(typeof requestedThreatTypes)[number], FallbackURLThreat>> = {
  MALWARE: 'malware',
  SOCIAL_ENGINEERING: 'social-engineering',
  UNWANTED_SOFTWARE: 'unwanted-software',
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export function getGoogleWebRiskConfiguration(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): GoogleWebRiskConfiguration {
  const configuredValue = environment.GOOGLE_WEB_RISK_API_KEY
  if (configuredValue === undefined || configuredValue.trim() === '') return { status: 'disabled' }
  const apiKey = configuredValue.trim()
  if (apiKey.length > 1_024 || /[\u0000-\u0020\u007f]/.test(apiKey)) {
    return {
      message: 'GOOGLE_WEB_RISK_API_KEY contains invalid characters.',
      status: 'misconfigured',
    }
  }
  return { apiKey, status: 'ready' }
}

async function readBoundedJSON(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maximumResponseBytes) {
    throw new Error('The URL safety provider returned too much data.')
  }
  if (!response.body) throw new Error('The URL safety provider returned no data.')

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
      throw new Error('The URL safety provider returned too much data.')
    }
    body += decoder.decode(chunk.value, { stream: true })
  }
  body += decoder.decode()
  return JSON.parse(body) as unknown
}

function parseWebRiskResult(value: unknown, observedAt: string): URLSafetyProviderResult | null {
  if (!isRecord(value)) return null
  if (!Object.hasOwn(value, 'threat')) {
    return Object.keys(value).length === 0 ? { kind: 'safe', observedAt, redirectCount: 0 } : null
  }
  if (!isRecord(value.threat)) return null
  const threatTypes = value.threat.threatTypes
  const expireTime = value.threat.expireTime
  if (
    !Array.isArray(threatTypes) ||
    threatTypes.length === 0 ||
    threatTypes.length > requestedThreatTypes.length ||
    !threatTypes.every(
      (threat): threat is (typeof requestedThreatTypes)[number] =>
        typeof threat === 'string' &&
        requestedThreatTypes.includes(threat as (typeof requestedThreatTypes)[number]),
    ) ||
    typeof expireTime !== 'string' ||
    !Number.isFinite(Date.parse(expireTime)) ||
    Date.parse(expireTime) <= Date.parse(observedAt)
  ) {
    return null
  }
  return {
    expiresAt: new Date(expireTime).toISOString(),
    kind: 'unsafe',
    observedAt,
    redirectCount: 0,
    threats: [...new Set(threatTypes.map((threat) => threatMapping[threat]))],
  }
}

export function createGoogleWebRiskURLSafetyProvider(
  apiKey: string,
  fetchImplementation: FetchImplementation = fetch,
  now: () => Date = () => new Date(),
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

      const requestURL = new URL(endpoint)
      requestURL.searchParams.set('uri', fallbackURL.value.canonicalUrl)
      for (const threatType of requestedThreatTypes) {
        requestURL.searchParams.append('threatTypes', threatType)
      }

      let response: Response
      try {
        // The destination is a fixed Google API endpoint. The tenant URL is a
        // lookup value; this process never opens the tenant-controlled origin.
        response = await fetchImplementation(requestURL, {
          headers: { accept: 'application/json', 'x-goog-api-key': apiKey },
          method: 'GET',
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
        const observed = now()
        if (!Number.isFinite(observed.getTime())) throw new Error('Invalid observation time.')
        return (
          parseWebRiskResult(await readBoundedJSON(response), observed.toISOString()) ?? {
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

export const googleWebRiskEndpoint = endpoint
export const googleWebRiskThreatTypes = requestedThreatTypes
