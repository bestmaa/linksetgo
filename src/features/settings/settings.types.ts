export type SettingsTab = 'general' | 'domain' | 'team' | 'system'
export type CheckoutPlan = 'pro' | 'starter'

export type SettingsTabViewModel = {
  active: boolean
  id: SettingsTab
  label: string
  onSelect: () => void
}

export type SettingsViewProps = {
  activeTab: SettingsTab
  apiStatus: string
  appCount: number
  billingError: string | null
  billingSummary: BillingSummaryDTO | null
  canCheckout: boolean
  checkoutError: string | null
  isBillingLoading: boolean
  isCheckoutLoading: boolean
  databaseLabel: string
  domain: string
  environment: string
  onCopyDomain: () => void
  onCheckout: (plan: CheckoutPlan) => void
  onOpenTeam: () => void
  onVerify: () => void
  tabs: readonly SettingsTabViewModel[]
  toast: string | null
  userEmail: string
  userRole: string
  verificationDetail: string
  verificationStatus: 'idle' | 'checking' | 'verified' | 'attention'
}
import type { BillingSummaryDTO } from '@/lib/client/payload-types'
