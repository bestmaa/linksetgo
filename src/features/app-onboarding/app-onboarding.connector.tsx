'use client'

import { AppOnboardingView } from './app-onboarding.view'
import { useAppOnboardingController } from './use-app-onboarding-controller'

export function AppOnboardingConnector() {
  return <AppOnboardingView {...useAppOnboardingController()} />
}
