import { NextResponse } from 'next/server'

import { MAX_ABUSE_REPORT_BODY_BYTES, parseAbuseReportInput } from '@/lib/domain/abuse-report'
import {
  rateLimitAbuseReportRequest,
  rateLimitAbuseReportTarget,
} from '@/lib/server/abuse-report-rate-limit'
import { recordPublicAbuseReport } from '@/lib/server/abuse-report-service'
import { readBoundedJSON } from '@/lib/server/bounded-json'
import { getServerEnvironment } from '@/lib/server/env'
import { getPayloadClient } from '@/lib/server/payload-client'

const response = (body: unknown, status: number, headers?: HeadersInit): NextResponse =>
  NextResponse.json(body, {
    status,
    headers: { 'cache-control': 'no-store', ...headers },
  })

const accepted = (): NextResponse =>
  response(
    {
      accepted: true,
      message: 'If this report matches a Relay resource, our trust team will review it.',
    },
    202,
  )

const rateLimited = (resetAt: string): NextResponse => {
  const retryAfter = Math.max(1, Math.ceil((Date.parse(resetAt) - Date.now()) / 1_000))
  return response(
    { accepted: false, error: { code: 'RATE_LIMITED', message: 'Try again later.' } },
    429,
    { 'retry-after': String(retryAfter) },
  )
}

export async function POST(request: Request): Promise<NextResponse> {
  const environment = getServerEnvironment()
  const requestLimit = await rateLimitAbuseReportRequest({
    eventHashSecret: environment.eventHashSecret,
    request,
    trustProxyClientIPHeader: environment.trustProxyClientIPHeader,
  })
  if (!requestLimit.allowed) return rateLimited(requestLimit.resetAt)

  const body = await readBoundedJSON(request, MAX_ABUSE_REPORT_BODY_BYTES)
  if (!body.ok) {
    return response(
      { accepted: false, error: { code: 'INVALID_REPORT', message: 'Invalid abuse report.' } },
      body.status,
    )
  }
  const parsed = parseAbuseReportInput(body.value)
  if (!parsed.ok) {
    return response(
      { accepted: false, error: { code: 'INVALID_REPORT', message: parsed.message } },
      400,
    )
  }
  if (parsed.bot) return accepted()

  const targetLimit = await rateLimitAbuseReportTarget({
    eventHashSecret: environment.eventHashSecret,
    hostname: parsed.value.targetHostname,
  })
  if (!targetLimit.allowed) return rateLimited(targetLimit.resetAt)

  try {
    await recordPublicAbuseReport({
      payload: await getPayloadClient(),
      report: parsed.value,
      request,
    })
    return accepted()
  } catch {
    return response(
      {
        accepted: false,
        error: { code: 'REPORT_UNAVAILABLE', message: 'The report could not be accepted.' },
      },
      503,
    )
  }
}
