export type MarketingPage =
  | 'changelog'
  | 'custom-domains'
  | 'docs'
  | 'home'
  | 'open-source'
  | 'pricing'
  | 'privacy'
  | 'react-native'
  | 'security'
  | 'self-hosting'
  | 'sponsor'
  | 'status'
  | 'terms'

export type MarketingViewProps = {
  isMenuOpen: boolean
  onCloseMenu: () => void
  onToggleMenu: () => void
  page: MarketingPage
  pricingPlans: readonly PricingPlanViewModel[]
  serviceStatus: ServiceStatusViewModel
  signupAvailable: boolean
  sourceCodeURL: string | null
  sponsorURL: string | null
}

export type PricingPlanViewModel = {
  badge: string
  cta: string
  description: string
  features: readonly string[]
  href: string
  name: string
  period: string
  price: string
  slug: string
}

export type ServiceStatusViewModel =
  | {
      componentLabel: 'Checking readiness'
      detail: 'Reading liveness and readiness now.'
      kind: 'checking'
      label: 'Checking current status'
    }
  | {
      componentLabel: 'Needs attention'
      detail: string
      kind: 'degraded'
      label: 'Service needs attention'
    }
  | {
      componentLabel: 'Operational'
      detail: string
      kind: 'operational'
      label: 'All systems operational'
    }
