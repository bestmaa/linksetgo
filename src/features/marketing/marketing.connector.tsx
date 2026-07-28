import { connection } from 'next/server'

import { getCloudSignupConfiguration } from '@/lib/server/cloud-signup-config'
import { getSourceCodeURL } from '@/lib/server/site-url'

import type { MarketingPage } from './marketing.types'
import { MarketingClientConnector } from './marketing-client.connector'

export async function MarketingConnector({
  page,
  sponsorURL = null,
}: {
  page: MarketingPage
  sponsorURL?: string | null
}) {
  await connection()

  return (
    <MarketingClientConnector
      page={page}
      signupAvailable={getCloudSignupConfiguration().status === 'ready'}
      sourceCodeURL={getSourceCodeURL()}
      sponsorURL={sponsorURL}
    />
  )
}
