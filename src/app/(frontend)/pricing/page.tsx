import type { Metadata } from 'next'

import { MarketingConnector } from '@/features/marketing/marketing.connector'

export const metadata: Metadata = {
  description: 'Self-host LinksetGo for free or choose simple managed cloud plans.',
  title: 'Pricing',
}

export default function PricingPage() {
  return <MarketingConnector page="pricing" />
}
