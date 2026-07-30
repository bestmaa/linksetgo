import 'server-only'

import type { PasswordResetSender } from './account-recovery-service'
import type { CloudEmailDeliveryConfiguration } from './cloud-signup-config'
import {
  createSMTPPasswordResetSender,
  createSMTPVerificationSender,
  type CloudSMTPTransportFactory,
} from './cloud-email-smtp'
import type { VerificationSender } from './cloud-signup-service'
import {
  createWebhookPasswordResetSender,
  createWebhookVerificationSender,
} from './cloud-verification-webhook'

export type CloudEmailDeliveryDependencies = {
  fetchImplementation?: typeof fetch
  smtpTransportFactory?: CloudSMTPTransportFactory
}

export function createCloudVerificationSender(
  configuration: CloudEmailDeliveryConfiguration,
  dependencies: CloudEmailDeliveryDependencies = {},
): VerificationSender {
  if (configuration.mode === 'webhook') {
    return createWebhookVerificationSender(configuration, dependencies.fetchImplementation)
  }
  return createSMTPVerificationSender(configuration, dependencies.smtpTransportFactory)
}

export function createCloudPasswordResetSender(
  configuration: CloudEmailDeliveryConfiguration,
  dependencies: CloudEmailDeliveryDependencies = {},
): PasswordResetSender {
  if (configuration.mode === 'webhook') {
    return createWebhookPasswordResetSender(configuration, dependencies.fetchImplementation)
  }
  return createSMTPPasswordResetSender(configuration, dependencies.smtpTransportFactory)
}
