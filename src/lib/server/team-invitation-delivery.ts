import 'server-only'

export type TeamInvitationDelivery = {
  email: string
  expiresAt: string
  invitationURL: string
  inviterName: string
  organizationName: string
  role: string
}

export type TeamInvitationSender = (delivery: TeamInvitationDelivery) => Promise<void>

type EnvironmentSource = Readonly<Record<string, string | undefined>>

export type TeamInvitationDeliveryConfiguration =
  | { reason: 'community-edition'; status: 'unavailable' }
  | { reason: string; status: 'misconfigured' }
  | {
      appBaseURL: string
      secret: string
      status: 'ready'
      webhookURL: string
    }

const safeHTTPSURL = (value: string | undefined, originOnly: boolean): string | null => {
  if (!value?.trim()) return null
  try {
    const url = new URL(value.trim())
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.hash ||
      (originOnly && (url.pathname !== '/' || Boolean(url.search)))
    ) {
      return null
    }
    return url.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

export function getTeamInvitationDeliveryConfiguration(
  environment: EnvironmentSource = process.env,
): TeamInvitationDeliveryConfiguration {
  if (environment.RELAY_EDITION?.trim().toLowerCase() !== 'cloud') {
    return { reason: 'community-edition', status: 'unavailable' }
  }

  const appBaseURL = safeHTTPSURL(environment.CLOUD_APP_BASE_URL, true)
  const webhookURL = safeHTTPSURL(environment.TEAM_INVITATION_WEBHOOK_URL, false)
  const secret = environment.TEAM_INVITATION_WEBHOOK_SECRET?.trim()
  if (!appBaseURL) {
    return {
      reason: 'CLOUD_APP_BASE_URL must be a safe HTTPS origin.',
      status: 'misconfigured',
    }
  }
  if (!webhookURL) {
    return {
      reason: 'TEAM_INVITATION_WEBHOOK_URL must be a safe HTTPS URL.',
      status: 'misconfigured',
    }
  }
  if (!secret || secret.length < 32) {
    return {
      reason: 'TEAM_INVITATION_WEBHOOK_SECRET must contain at least 32 characters.',
      status: 'misconfigured',
    }
  }
  return { appBaseURL, secret, status: 'ready', webhookURL }
}

export function createWebhookTeamInvitationSender(input: {
  secret: string
  url: string
}): TeamInvitationSender {
  return async (delivery) => {
    const response = await fetch(input.url, {
      body: JSON.stringify({
        email: delivery.email,
        expiresAt: delivery.expiresAt,
        invitationURL: delivery.invitationURL,
        inviterName: delivery.inviterName,
        organizationName: delivery.organizationName,
        role: delivery.role,
        template: 'relay-team-invitation',
      }),
      headers: {
        authorization: `Bearer ${input.secret}`,
        'content-type': 'application/json',
      },
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(8_000),
    })
    if (!response.ok) throw new Error('Invitation delivery provider rejected the request.')
  }
}
