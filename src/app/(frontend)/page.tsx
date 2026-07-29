import type { Metadata } from 'next'

import { MarketingConnector } from '@/features/marketing/marketing.connector'

export const metadata: Metadata = {
  description: 'Create, validate and operate mobile deep links with LinksetGo.',
  title: {
    absolute: 'LinksetGo — Deep links, done right',
  },
}

export default function HomePage() {
  return <MarketingConnector page="home" />
}
