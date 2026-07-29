'use client'

import type { MarketingPage } from './marketing.types'
import { MarketingView } from './marketing.view'
import { useMarketingController } from './use-marketing-controller'

export function MarketingClientConnector({
  appBaseURL,
  page,
  signupAvailable,
  sourceCodeURL,
  sponsorURL,
}: {
  appBaseURL: string
  page: MarketingPage
  signupAvailable: boolean
  sourceCodeURL: string | null
  sponsorURL: string | null
}) {
  return (
    <MarketingView
      {...useMarketingController(page, sourceCodeURL, sponsorURL, signupAvailable, appBaseURL)}
    />
  )
}
