import 'server-only'

import {
  DisabledDomainProvisioningProvider,
  type DomainProvisioningProvider,
} from '@/lib/application/domain-provisioning-provider'
import {
  createWebhookDomainProvisioningProvider,
  getDomainProvisioningWebhookConfiguration,
} from './domain-provisioning-webhook'

export type DomainProviderConfiguration =
  | {
      configured: true
      key: string
      provider: DomainProvisioningProvider
    }
  | {
      configured: false
      key: 'disabled' | 'misconfigured'
      message: string
      provider: DomainProvisioningProvider
    }

type DomainProviderFactory = () => DomainProviderConfiguration

let registeredFactory: DomainProviderFactory | null = null

export function registerDomainProvisioningProvider(factory: DomainProviderFactory): void {
  registeredFactory = factory
}

export function getDomainProvisioningProviderConfiguration(): DomainProviderConfiguration {
  if (registeredFactory) return registeredFactory()

  const webhook = getDomainProvisioningWebhookConfiguration()
  if (webhook.status === 'ready') {
    return {
      configured: true,
      key: 'webhook',
      provider: createWebhookDomainProvisioningProvider(webhook),
    }
  }

  const provider = new DisabledDomainProvisioningProvider()
  return webhook.status === 'misconfigured'
    ? {
        configured: false,
        key: 'misconfigured',
        message: webhook.message,
        provider,
      }
    : {
        configured: false,
        key: 'disabled',
        message:
          'Automatic domain checks are disabled. Ask the LinksetGo operator to verify this hostname.',
        provider,
      }
}
