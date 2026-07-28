import type { Metadata } from 'next'

import { MarketingConnector } from '@/features/marketing/marketing.connector'

export const metadata: Metadata = {
  description: 'Learn how Relay resolves, validates and operates mobile deep links.',
  title: 'Documentation',
}

export default function DocsPage() {
  return <MarketingConnector page="docs" />
}
