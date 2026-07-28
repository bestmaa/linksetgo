import { NextResponse } from 'next/server'

import { evaluateReadiness } from '@/lib/server/health'
import { getPayloadClient } from '@/lib/server/payload-client'

export const dynamic = 'force-dynamic'

export const GET = async (): Promise<NextResponse> => {
  const result = await evaluateReadiness(async () => {
    const payload = await getPayloadClient()
    await payload.count({
      collection: 'users',
      overrideAccess: true,
    })
  })

  return NextResponse.json(result, {
    status: result.status === 'ok' ? 200 : 503,
    headers: {
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
    },
  })
}
