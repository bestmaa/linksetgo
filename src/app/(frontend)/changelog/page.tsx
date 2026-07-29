import type { Metadata } from 'next'

import { MarketingConnector } from '@/features/marketing/marketing.connector'

export const metadata: Metadata = {
  description: 'Track LinksetGo Community releases and managed Cloud milestones.',
  title: 'Changelog',
}

export default function ChangelogPage() {
  return <MarketingConnector page="changelog" />
}
