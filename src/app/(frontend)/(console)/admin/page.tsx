import type { Metadata } from 'next'

import { OverviewConnector } from '@/features/overview/overview.connector'

export const metadata: Metadata = {
  title: 'Overview',
}

export default function OverviewPage() {
  return <OverviewConnector />
}
