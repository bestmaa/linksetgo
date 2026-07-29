import type { CloudPlanKey } from '@/lib/domain/plan-catalog'
import type { SubscriptionEvent } from '@/lib/domain/subscription-state'

export type BillingCheckoutRequest = {
  cancelURL: string
  customerEmail: string
  organizationID: string
  plan: Exclude<CloudPlanKey, 'free'>
  successURL: string
}

export type BillingPortalRequest = {
  customerID: string
  returnURL: string
}

export type BillingSession = {
  expiresAt: string | null
  url: string
}

export type BillingWebhookRequest = {
  body: Uint8Array
  headers: Readonly<Record<string, string>>
}

export type BillingProviderResult<T> =
  | { kind: 'disabled'; message: string }
  | { kind: 'error'; message: string; retryable: boolean }
  | { kind: 'success'; value: T }

export interface BillingProvider {
  createCheckoutSession(
    request: BillingCheckoutRequest,
  ): Promise<BillingProviderResult<BillingSession>>
  createCustomerPortalSession(
    request: BillingPortalRequest,
  ): Promise<BillingProviderResult<BillingSession>>
  verifyAndParseWebhook(
    request: BillingWebhookRequest,
  ): Promise<BillingProviderResult<SubscriptionEvent>>
}

export class DisabledBillingProvider implements BillingProvider {
  async createCheckoutSession(
    _request: BillingCheckoutRequest,
  ): Promise<BillingProviderResult<BillingSession>> {
    return {
      kind: 'disabled',
      message: 'Billing is disabled for this LinksetGo deployment.',
    }
  }

  async createCustomerPortalSession(
    _request: BillingPortalRequest,
  ): Promise<BillingProviderResult<BillingSession>> {
    return {
      kind: 'disabled',
      message: 'Billing is disabled for this LinksetGo deployment.',
    }
  }

  async verifyAndParseWebhook(
    _request: BillingWebhookRequest,
  ): Promise<BillingProviderResult<SubscriptionEvent>> {
    return {
      kind: 'disabled',
      message: 'Billing is disabled for this LinksetGo deployment.',
    }
  }
}
