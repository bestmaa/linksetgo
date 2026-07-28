import 'server-only'

import { DisabledBillingProvider, type BillingProvider } from '@/lib/application/billing-provider'

export type BillingProviderConfiguration = {
  configured: boolean
  key: string
  provider: BillingProvider
}

type BillingProviderFactory = () => BillingProviderConfiguration

let configuredFactory: BillingProviderFactory | null = null

export function registerBillingProvider(factory: BillingProviderFactory): void {
  configuredFactory = factory
}

export function getBillingProviderConfiguration(): BillingProviderConfiguration {
  return (
    configuredFactory?.() ?? {
      configured: false,
      key: 'disabled',
      provider: new DisabledBillingProvider(),
    }
  )
}
