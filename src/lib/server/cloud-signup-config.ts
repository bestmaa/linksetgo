import 'server-only'

import { evaluateCloudSignupGate } from '@/lib/domain/cloud-signup'
import { normalizeHostname } from '@/lib/domain/workspace-domain'

type EnvironmentSource = Readonly<Record<string, string | undefined>>

export type CloudEmailDeliveryConfiguration =
  | {
      mode: 'smtp'
      fromAddress: string
      fromName: string
      host: string
      password: string
      port: number
      security: 'implicit-tls' | 'starttls'
      username: string
    }
  | {
      mode: 'webhook'
      secret: string
      url: string
    }

export type CloudAccountRecoveryConfiguration =
  | {
      status: 'misconfigured'
      reason: string
    }
  | {
      status: 'ready'
      appBaseURL: string
      emailDelivery: CloudEmailDeliveryConfiguration
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
      emailDelivery: CloudEmailDeliveryConfiguration
      managedLinkRootDomain: string | null
      sharedLinkBaseURL: string
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

const isConfigured = (value: string | undefined): boolean => Boolean(value?.trim())

const parseMailbox = (value: string | undefined): string | null => {
  const candidate = value?.trim()
  if (!candidate || candidate.length > 254 || /[\s<>(){},;:\\"]/u.test(candidate)) return null

  const separator = candidate.lastIndexOf('@')
  if (separator < 1 || separator > 64 || separator === candidate.length - 1) return null
  const localPart = candidate.slice(0, separator)
  const hostname = normalizeHostname(candidate.slice(separator + 1))
  if (
    !hostname ||
    localPart.startsWith('.') ||
    localPart.endsWith('.') ||
    localPart.includes('..')
  ) {
    return null
  }
  return `${localPart}@${hostname}`
}

const getCloudEmailDeliveryConfiguration = (
  environment: EnvironmentSource,
):
  | CloudEmailDeliveryConfiguration
  | {
      status: 'misconfigured'
      reason: string
    } => {
  const webhookFields = [
    environment.CLOUD_VERIFICATION_WEBHOOK_URL,
    environment.CLOUD_VERIFICATION_WEBHOOK_SECRET,
  ]
  const smtpFields = [
    environment.CLOUD_SMTP_HOST,
    environment.CLOUD_SMTP_PORT,
    environment.CLOUD_SMTP_SECURITY,
    environment.CLOUD_SMTP_USERNAME,
    environment.CLOUD_SMTP_PASSWORD,
    environment.CLOUD_SMTP_FROM_EMAIL,
    environment.CLOUD_SMTP_FROM_NAME,
  ]
  const hasWebhookConfiguration = webhookFields.some(isConfigured)
  const hasSMTPConfiguration = smtpFields.some(isConfigured)

  if (hasWebhookConfiguration === hasSMTPConfiguration) {
    return {
      status: 'misconfigured',
      reason: 'Configure exactly one complete Cloud email delivery mode: webhook or SMTP.',
    }
  }

  if (hasWebhookConfiguration) {
    const url = absoluteWebURL(
      environment.CLOUD_VERIFICATION_WEBHOOK_URL,
      environment.NODE_ENV,
      false,
    )
    const secret = environment.CLOUD_VERIFICATION_WEBHOOK_SECRET?.trim()
    if (!url) {
      return {
        status: 'misconfigured',
        reason: 'CLOUD_VERIFICATION_WEBHOOK_URL must be a safe HTTPS URL.',
      }
    }
    if (!secret || secret.length < 32) {
      return {
        status: 'misconfigured',
        reason: 'CLOUD_VERIFICATION_WEBHOOK_SECRET must contain at least 32 characters.',
      }
    }
    return { mode: 'webhook', secret, url }
  }

  const host = normalizeHostname(environment.CLOUD_SMTP_HOST)
  const portValue = environment.CLOUD_SMTP_PORT?.trim() ?? ''
  const port = /^\d{1,5}$/u.test(portValue) ? Number(portValue) : Number.NaN
  const security = environment.CLOUD_SMTP_SECURITY?.trim().toLowerCase()
  const username = environment.CLOUD_SMTP_USERNAME?.trim()
  const password = environment.CLOUD_SMTP_PASSWORD
  const fromAddress = parseMailbox(environment.CLOUD_SMTP_FROM_EMAIL)
  const configuredFromName = environment.CLOUD_SMTP_FROM_NAME?.trim()
  const fromName = configuredFromName || 'LinksetGo Cloud'

  if (!host) {
    return { status: 'misconfigured', reason: 'CLOUD_SMTP_HOST must be one exact hostname.' }
  }
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    return {
      status: 'misconfigured',
      reason: 'CLOUD_SMTP_PORT must be an integer from 1 through 65535.',
    }
  }
  if (security !== 'implicit-tls' && security !== 'starttls') {
    return {
      status: 'misconfigured',
      reason: 'CLOUD_SMTP_SECURITY must be either "implicit-tls" or "starttls".',
    }
  }
  if (!username || username.length > 512 || /[\r\n]/u.test(username)) {
    return { status: 'misconfigured', reason: 'CLOUD_SMTP_USERNAME is invalid.' }
  }
  if (!password?.trim() || password.length > 4_096 || /[\r\n]/u.test(password)) {
    return { status: 'misconfigured', reason: 'CLOUD_SMTP_PASSWORD is invalid.' }
  }
  if (!fromAddress) {
    return { status: 'misconfigured', reason: 'CLOUD_SMTP_FROM_EMAIL is invalid.' }
  }
  if (fromName.length > 100 || /[\r\n]/u.test(fromName)) {
    return { status: 'misconfigured', reason: 'CLOUD_SMTP_FROM_NAME is invalid.' }
  }

  return {
    mode: 'smtp',
    fromAddress,
    fromName,
    host,
    password,
    port,
    security,
    username,
  }
}

export function getCloudSignupConfiguration(
  environment: EnvironmentSource = process.env,
): CloudSignupConfiguration {
  const gate = evaluateCloudSignupGate({
    cloudSignupEnabled: environment.CLOUD_SIGNUP_ENABLED,
    linksetGoEdition: environment.RELAY_EDITION,
  })
  if (!gate.ok) {
    return {
      status: 'unavailable',
      reason: gate.code === 'COMMUNITY_EDITION' ? 'community-edition' : 'signup-disabled',
    }
  }

  const recovery = getCloudAccountRecoveryConfiguration(environment)
  if (recovery.status !== 'ready') return recovery

  const sharedLinkBaseURL = absoluteWebURL(
    environment.SHARED_LINK_BASE_URL,
    environment.NODE_ENV,
    true,
  )
  if (!sharedLinkBaseURL) {
    return {
      status: 'misconfigured',
      reason: 'SHARED_LINK_BASE_URL must be a safe HTTPS origin.',
    }
  }
  const sharedHostname = new URL(sharedLinkBaseURL).hostname
  const reservedSurfaceHostnames = [
    recovery.appBaseURL,
    absoluteWebURL(environment.MARKETING_SITE_URL, environment.NODE_ENV, true),
    absoluteWebURL(environment.NEXT_PUBLIC_SITE_URL, environment.NODE_ENV, true),
  ].flatMap((value) => (value ? [new URL(value).hostname] : []))
  if (reservedSurfaceHostnames.includes(sharedHostname)) {
    return {
      status: 'misconfigured',
      reason:
        'SHARED_LINK_BASE_URL must use a hostname separate from the application and marketing sites.',
    }
  }

  return {
    status: 'ready',
    appBaseURL: recovery.appBaseURL,
    emailDelivery: recovery.emailDelivery,
    managedLinkRootDomain: null,
    sharedLinkBaseURL,
  }
}

export function getCloudAccountRecoveryConfiguration(
  environment: EnvironmentSource = process.env,
): CloudAccountRecoveryConfiguration {
  if (environment.RELAY_EDITION?.trim().toLowerCase() !== 'cloud') {
    return { status: 'unavailable', reason: 'community-edition' }
  }
  if (environment.TRUST_PROXY_CLIENT_IP_HEADER?.trim().toLowerCase() !== 'true') {
    return {
      status: 'misconfigured',
      reason:
        'TRUST_PROXY_CLIENT_IP_HEADER=true requires a trusted ingress that replaces client-supplied IP headers.',
    }
  }

  const appBaseURL = absoluteWebURL(environment.CLOUD_APP_BASE_URL, environment.NODE_ENV, true)
  if (!appBaseURL) {
    return { status: 'misconfigured', reason: 'CLOUD_APP_BASE_URL must be a safe HTTPS origin.' }
  }
  const emailDelivery = getCloudEmailDeliveryConfiguration(environment)
  if ('status' in emailDelivery) return emailDelivery

  return {
    status: 'ready',
    appBaseURL,
    emailDelivery,
  }
}
