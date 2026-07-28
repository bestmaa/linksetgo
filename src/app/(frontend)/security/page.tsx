import type { Metadata } from 'next'

import { MarketingConnector } from '@/features/marketing/marketing.connector'

export const metadata: Metadata = {
  description: 'Learn how Relay protects deep-link configuration and public resolution.',
  title: 'Security',
}

export default function SecurityPage() {
  return <MarketingConnector page="security" />
}
