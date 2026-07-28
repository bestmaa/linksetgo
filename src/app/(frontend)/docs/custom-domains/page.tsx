import type { Metadata } from 'next'

import { MarketingConnector } from '@/features/marketing/marketing.connector'

export const metadata: Metadata = {
  description: 'Verify DNS ownership, TLS and mobile associations for a Relay custom domain.',
  title: 'Custom domains',
}

export default function CustomDomainsGuidePage() {
  return <MarketingConnector page="custom-domains" />
}
