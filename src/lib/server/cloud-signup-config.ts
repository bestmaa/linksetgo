import 'server-only'

import { evaluateCloudSignupGate } from '@/lib/domain/cloud-signup'
import { normalizeHostname } from '@/lib/domain/workspace-domain'

type EnvironmentSource = Readonly<Record<string, string | undefined>>

export type CloudAccountRecoveryConfiguration =
  | {
      status: 'misconfigured'
      reason: string
    }
  | {
      status: 'ready'
      appBaseURL: string
      verificationWebhookSecret: string
      verificationWebhookURL: string
    }
  | {
      status: 'unavailable'
      reason: 'community-edition'
    }

export type CloudSignupConfiguration =
  | {
      status: 'misconfigured'
      reason: string
    }
  | {
      status: 'ready'
      appBaseURL: string
      managedLinkRootDomain: string
      verificationWebhookSecret: string
      verificationWebhookURL: string
    }
  | {
      status: 'unavailable'
      reason: 'community-edition' | 'signup-disabled'
    }

const absoluteWebURL = (
  value: string | undefined,
  nodeEnvironment: string | undefined,
  originOnly: boolean,
): string | null => {
  if (!value?.trim()) return null

  try {
    const url = new URL(value.trim())
    const isLoopback =
      url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
    if (
      url.username ||
      url.password ||
      url.hash ||
      (originOnly && (url.pathname !== '/' || Boolean(url.search))) ||
      (url.protocol !== 'https:' &&
        !(nodeEnvironment !== 'production' && url.protocol === 'http:' && isLoopback))
    ) {
      return null
    }
    return url.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

export function getCloudSignupConfiguration(
  environment: EnvironmentSource = process.env,
): CloudSignupConfiguration {
  const gate = evaluateCloudSignupGate({
    cloudSignupEnabled: environment.CLOUD_SIGNUP_ENABLED,
    relayEdition: environment.RELAY_EDITION,
  })
  if (!gate.ok) {
    return {
      status: 'unavailable',
      reason: gate.code === 'COMMUNITY_EDITION' ? 'community-edition' : 'signup-disabled',
    }
  }

  const recovery = getCloudAccountRecoveryConfiguration(environment)
  if (recovery.status !== 'ready') return recovery

  const managedLinkRootDomain = normalizeHostname(environment.MANAGED_LINK_ROOT_DOMAIN)
  if (!managedLinkRootDomain) {
    return {
      status: 'misconfigured',
      reason: 'MANAGED_LINK_ROOT_DOMAIN must be one normalized hostname.',
    }
  }

  return {
    status: 'ready',
    appBaseURL: recovery.appBaseURL,
    managedLinkRootDomain,
    verificationWebhookSecret: recovery.verificationWebhookSecret,
    verificationWebhookURL: recovery.verificationWebhookURL,
  }
}

export function getCloudAccountRecoveryConfiguration(
  environment: EnvironmentSource = process.env,
): CloudAccountRecoveryConfiguration {
  if (environment.RELAY_EDITION?.trim().toLowerCase() !== 'cloud') {
    return { status: 'unavailable', reason: 'community-edition' }
  }

  const appBaseURL = absoluteWebURL(environment.CLOUD_APP_BASE_URL, environment.NODE_ENV, true)
  const verificationWebhookURL = absoluteWebURL(
    environment.CLOUD_VERIFICATION_WEBHOOK_URL,
    environment.NODE_ENV,
    false,
  )
  const verificationWebhookSecret = environment.CLOUD_VERIFICATION_WEBHOOK_SECRET?.trim()

  if (!appBaseURL) {
    return { status: 'misconfigured', reason: 'CLOUD_APP_BASE_URL must be a safe HTTPS origin.' }
  }
  if (!verificationWebhookURL) {
    return {
      status: 'misconfigured',
      reason: 'CLOUD_VERIFICATION_WEBHOOK_URL must be a safe HTTPS URL.',
    }
  }
  if (!verificationWebhookSecret || verificationWebhookSecret.length < 32) {
    return {
      status: 'misconfigured',
      reason: 'CLOUD_VERIFICATION_WEBHOOK_SECRET must contain at least 32 characters.',
    }
  }

  return {
    status: 'ready',
    appBaseURL,
    verificationWebhookSecret,
    verificationWebhookURL,
  }
}
