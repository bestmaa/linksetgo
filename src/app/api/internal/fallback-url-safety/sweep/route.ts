import { NextResponse } from 'next/server'

import {
  authorizeFallbackURLSafetySweep,
  getFallbackURLSafetySweepConfiguration,
  sweepFallbackURLSafetyAssessments,
} from '@/lib/server/fallback-url-safety-sweep'
import { getFallbackURLSafetyProviderConfiguration } from '@/lib/server/fallback-url-safety-webhook'
import {
  getFallbackOriginDNSRefreshConfiguration,
  sweepFallbackOriginDNSOwnership,
} from '@/lib/server/fallback-origin-dns-sweep'
import { getFallbackOriginDNSProviderConfiguration } from '@/lib/server/fallback-origin-dns-webhook'
import { getPayloadClient } from '@/lib/server/payload-client'
import { pruneExpiredPostgresRateLimitWindows } from '@/lib/server/postgres-rate-limit-provider'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const responseHeaders = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex',
}

export async function POST(request: Request): Promise<NextResponse> {
  const sweep = getFallbackURLSafetySweepConfiguration()
  if (sweep.status !== 'ready') {
    return NextResponse.json(
      { message: 'Fallback URL safety sweep is unavailable.', ok: false },
      { headers: responseHeaders, status: 503 },
    )
  }
  if (!authorizeFallbackURLSafetySweep(request.headers.get('authorization'), sweep.secret)) {
    return NextResponse.json(
      { message: 'Unauthorized.', ok: false },
      { headers: responseHeaders, status: 401 },
    )
  }

  const dnsRefresh = getFallbackOriginDNSRefreshConfiguration()
  const dnsProvider = getFallbackOriginDNSProviderConfiguration()
  if (dnsRefresh.status !== 'ready' || !dnsProvider.available) {
    return NextResponse.json(
      { message: 'Fallback-origin DNS renewal is unavailable.', ok: false },
      { headers: responseHeaders, status: 503 },
    )
  }

  try {
    const payload = await getPayloadClient()
    const rateLimitsPruned = await pruneExpiredPostgresRateLimitWindows()
    const dnsOwnership = await sweepFallbackOriginDNSOwnership({
      batchSize: dnsRefresh.batchSize,
      evidenceMaxAgeMs: dnsRefresh.evidenceMaxAgeMs,
      outageGraceMs: dnsRefresh.outageGraceMs,
      payload,
      provider: dnsProvider.provider,
      renewalLeadMs: dnsRefresh.renewalLeadMs,
    })
    const safety = getFallbackURLSafetyProviderConfiguration()
    if (!safety.available) {
      return NextResponse.json(
        {
          dnsOwnership,
          message: 'Fallback URL safety provider is unavailable.',
          ok: false,
          rateLimitsPruned,
        },
        { headers: responseHeaders, status: 503 },
      )
    }
    const result = await sweepFallbackURLSafetyAssessments({
      batchSize: sweep.batchSize,
      maxAgeMs: safety.maxAgeMs,
      payload,
      provider: safety.provider,
    })
    return NextResponse.json(
      { dnsOwnership, ok: true, rateLimitsPruned, result },
      { headers: responseHeaders, status: 200 },
    )
  } catch {
    return NextResponse.json(
      { message: 'Fallback URL safety sweep failed.', ok: false },
      { headers: responseHeaders, status: 503 },
    )
  }
}
