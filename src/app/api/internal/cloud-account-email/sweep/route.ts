import { NextResponse } from 'next/server'

import {
  authorizeCloudAccountEmailSweep,
  getCloudAccountEmailSweepConfiguration,
} from '@/lib/server/cloud-account-email-sweep'
import { runCloudAccountEmailOutbox } from '@/lib/server/cloud-account-email-outbox'
import { getPayloadClient } from '@/lib/server/payload-client'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const responseHeaders = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex',
}

export async function POST(request: Request): Promise<NextResponse> {
  const configuration = getCloudAccountEmailSweepConfiguration()
  if (configuration.status !== 'ready') {
    return NextResponse.json(
      { message: 'Cloud account email sweep is unavailable.', ok: false },
      { headers: responseHeaders, status: 503 },
    )
  }
  if (
    !authorizeCloudAccountEmailSweep(request.headers.get('authorization'), configuration.secret)
  ) {
    return NextResponse.json(
      { message: 'Unauthorized.', ok: false },
      { headers: responseHeaders, status: 401 },
    )
  }

  try {
    await runCloudAccountEmailOutbox(await getPayloadClient(), configuration.batchSize)
    return NextResponse.json({ ok: true }, { headers: responseHeaders, status: 200 })
  } catch {
    return NextResponse.json(
      { message: 'Cloud account email sweep failed.', ok: false },
      { headers: responseHeaders, status: 503 },
    )
  }
}
