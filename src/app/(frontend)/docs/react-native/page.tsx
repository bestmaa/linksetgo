import type { Metadata } from 'next'

import { MarketingConnector } from '@/features/marketing/marketing.connector'

export const metadata: Metadata = {
  description: 'Connect React Native routes to LinksetGo Universal Links and Android App Links.',
  title: 'React Native integration',
}

export default function ReactNativeGuidePage() {
  return <MarketingConnector page="react-native" />
}
