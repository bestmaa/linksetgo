import type { Metadata } from 'next'

import { AppOnboardingConnector } from '@/features/app-onboarding/app-onboarding.connector'

export const metadata: Metadata = {
  title: 'Add app',
}

export default function AddAppPage() {
  return <AppOnboardingConnector />
}
