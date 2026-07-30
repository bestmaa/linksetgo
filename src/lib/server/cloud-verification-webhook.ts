import 'server-only'

import type { VerificationSender } from './cloud-signup-service'
import type { PasswordResetSender } from './account-recovery-service'

type WebhookVerificationSenderOptions = {
  secret: string
  url: string
}

export function createWebhookVerificationSender(
  options: WebhookVerificationSenderOptions,
  fetchImplementation: typeof fetch = fetch,
): VerificationSender {
  return async (delivery) => {
    const response = await fetchImplementation(options.url, {
      body: JSON.stringify({
        email: delivery.email,
        expiresAt: delivery.expiresAt,
        name: delivery.name,
        template: 'relay-cloud-verify-email',
        verificationURL: delivery.verificationURL,
      }),
      headers: {
        authorization: `Bearer ${options.secret}`,
        'content-type': 'application/json',
      },
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(8_000),
    })

    if (!response.ok) {
      throw new Error('Verification delivery provider rejected the request.')
    }
  }
}

export function createWebhookPasswordResetSender(
  options: WebhookVerificationSenderOptions,
  fetchImplementation: typeof fetch = fetch,
): PasswordResetSender {
  return async (delivery) => {
    const response = await fetchImplementation(options.url, {
      body: JSON.stringify({
        email: delivery.email,
        expiresAt: delivery.expiresAt,
        name: delivery.name,
        resetURL: delivery.resetURL,
        template: 'relay-cloud-reset-password',
      }),
      headers: {
        authorization: `Bearer ${options.secret}`,
        'content-type': 'application/json',
      },
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(8_000),
    })

    if (!response.ok) throw new Error('Password-reset delivery provider rejected the request.')
  }
}
