import type { Metadata } from 'next'

import { MarketingConnector } from '@/features/marketing/marketing.connector'
import { getSponsorURL } from '@/lib/server/site-url'

export const metadata: Metadata = {
  description: 'Support LinksetGo Community maintenance, documentation and security work.',
  title: 'Sponsor',
}

export default function SponsorPage() {
  return <MarketingConnector page="sponsor" sponsorURL={getSponsorURL()} />
}
