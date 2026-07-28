import type { Metadata } from 'next'

import { FallbackOriginsConnector } from '@/features/fallback-origins/fallback-origins.connector'
import { getRelayEdition } from '@/lib/server/deployment-edition'

export const metadata: Metadata = {
  title: 'Fallback origins',
}

export const dynamic = 'force-dynamic'

export default function FallbackOriginsPage() {
  return <FallbackOriginsConnector required={getRelayEdition() === 'cloud'} />
}
