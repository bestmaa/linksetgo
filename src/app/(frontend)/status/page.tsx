import type { Metadata } from 'next'

import { MarketingConnector } from '@/features/marketing/marketing.connector'

export const metadata: Metadata = {
  description: 'Check current LinksetGo process and database readiness.',
  title: 'Status',
}

export default function StatusPage() {
  return <MarketingConnector page="status" />
}
