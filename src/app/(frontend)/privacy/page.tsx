import type { Metadata } from 'next'

import { MarketingConnector } from '@/features/marketing/marketing.connector'

export const metadata: Metadata = {
  description: 'Review the pre-launch Relay data and privacy model.',
  title: 'Privacy',
}

export default function PrivacyPage() {
  return <MarketingConnector page="privacy" />
}
