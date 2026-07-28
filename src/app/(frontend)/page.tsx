import type { Metadata } from 'next'

import { MarketingConnector } from '@/features/marketing/marketing.connector'

export const metadata: Metadata = {
  description: 'Open-source mobile deep-link infrastructure with managed hosting when you need it.',
  title: 'Open-source deep links that stay under your control · Relay',
}

export default function HomePage() {
  return <MarketingConnector page="home" />
}
