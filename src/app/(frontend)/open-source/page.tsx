import type { Metadata } from 'next'

import { MarketingConnector } from '@/features/marketing/marketing.connector'

export const metadata: Metadata = {
  description: 'Self-host Relay Community and contribute to its open-source foundation.',
  title: 'Open source',
}

export default function OpenSourcePage() {
  return <MarketingConnector page="open-source" />
}
