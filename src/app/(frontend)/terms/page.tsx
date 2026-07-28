import type { Metadata } from 'next'

import { MarketingConnector } from '@/features/marketing/marketing.connector'

export const metadata: Metadata = {
  description: 'Review LinksetGo Community licensing and hosted-service launch requirements.',
  title: 'Terms',
}

export default function TermsPage() {
  return <MarketingConnector page="terms" />
}
