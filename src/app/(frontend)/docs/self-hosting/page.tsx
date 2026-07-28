import type { Metadata } from 'next'

import { MarketingConnector } from '@/features/marketing/marketing.connector'

export const metadata: Metadata = {
  description: 'Install, secure, back up and upgrade Relay Community with Docker Compose.',
  title: 'Self-hosting',
}

export default function SelfHostingGuidePage() {
  return <MarketingConnector page="self-hosting" />
}
