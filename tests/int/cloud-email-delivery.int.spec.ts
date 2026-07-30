import { describe, expect, it, vi } from 'vitest'

import {
  createCloudPasswordResetSender,
  createCloudVerificationSender,
} from '@/lib/server/cloud-email-delivery'
import type {
  CloudSMTPTransport,
  CloudSMTPTransportFactory,
  CloudSMTPTransportOptions,
} from '@/lib/server/cloud-email-smtp'
import {
  getCloudAccountRecoveryConfiguration,
  getCloudSignupConfiguration,
} from '@/lib/server/cloud-signup-config'

const smtpConfiguration = {
  fromAddress: 'account@linksetgo.test',
  fromName: 'LinksetGo Cloud',
  host: 'smtp.linksetgo.test',
  mode: 'smtp',
  password: 'test-only-smtp-password',
  port: 587,
  security: 'starttls',
  username: 'account@linksetgo.test',
} as const

const smtpEnvironment = {
  CLOUD_APP_BASE_URL: 'https://app.linksetgo.test',
  CLOUD_SMTP_FROM_EMAIL: smtpConfiguration.fromAddress,
  CLOUD_SMTP_FROM_NAME: smtpConfiguration.fromName,
  CLOUD_SMTP_HOST: smtpConfiguration.host,
  CLOUD_SMTP_PASSWORD: smtpConfiguration.password,
  CLOUD_SMTP_PORT: String(smtpConfiguration.port),
  CLOUD_SMTP_SECURITY: smtpConfiguration.security,
  CLOUD_SMTP_USERNAME: smtpConfiguration.username,
  NODE_ENV: 'production',
  RELAY_EDITION: 'cloud',
  TRUST_PROXY_CLIENT_IP_HEADER: 'true',
} as const

describe('Cloud email delivery configuration', () => {
  it('accepts one complete SMTP mode for signup and recovery', () => {
    expect(getCloudAccountRecoveryConfiguration(smtpEnvironment)).toEqual({
      appBaseURL: 'https://app.linksetgo.test',
      emailDelivery: smtpConfiguration,
      status: 'ready',
    })
    expect(
      getCloudSignupConfiguration({
        ...smtpEnvironment,
        CLOUD_SIGNUP_ENABLED: 'true',
        SHARED_LINK_BASE_URL: 'https://go.linksetgo.test',
      }),
    ).toMatchObject({
      emailDelivery: smtpConfiguration,
      status: 'ready',
    })
  })

  it('preserves one complete HTTPS webhook mode', () => {
    expect(
      getCloudAccountRecoveryConfiguration({
        CLOUD_APP_BASE_URL: 'https://app.linksetgo.test',
        CLOUD_VERIFICATION_WEBHOOK_SECRET: 'w'.repeat(32),
        CLOUD_VERIFICATION_WEBHOOK_URL: 'https://mailer.linksetgo.test/cloud-email',
        NODE_ENV: 'production',
        RELAY_EDITION: 'cloud',
        TRUST_PROXY_CLIENT_IP_HEADER: 'true',
      }),
    ).toEqual({
      appBaseURL: 'https://app.linksetgo.test',
      emailDelivery: {
        mode: 'webhook',
        secret: 'w'.repeat(32),
        url: 'https://mailer.linksetgo.test/cloud-email',
      },
      status: 'ready',
    })
  })

  it('fails closed for missing, partial, mixed, or unsafe delivery modes', () => {
    const base = {
      CLOUD_APP_BASE_URL: 'https://app.linksetgo.test',
      NODE_ENV: 'production',
      RELAY_EDITION: 'cloud',
      TRUST_PROXY_CLIENT_IP_HEADER: 'true',
    } as const
    expect(getCloudAccountRecoveryConfiguration(base)).toMatchObject({
      status: 'misconfigured',
    })
    expect(
      getCloudAccountRecoveryConfiguration({
        ...base,
        CLOUD_SMTP_HOST: smtpConfiguration.host,
      }),
    ).toMatchObject({ status: 'misconfigured' })
    expect(
      getCloudAccountRecoveryConfiguration({
        ...smtpEnvironment,
        CLOUD_VERIFICATION_WEBHOOK_SECRET: 'w'.repeat(32),
        CLOUD_VERIFICATION_WEBHOOK_URL: 'https://mailer.linksetgo.test/cloud-email',
      }),
    ).toEqual({
      reason: 'Configure exactly one complete Cloud email delivery mode: webhook or SMTP.',
      status: 'misconfigured',
    })
    expect(
      getCloudAccountRecoveryConfiguration({
        ...smtpEnvironment,
        CLOUD_SMTP_SECURITY: 'plain',
      }),
    ).toMatchObject({ status: 'misconfigured' })
    expect(
      getCloudAccountRecoveryConfiguration({
        ...smtpEnvironment,
        CLOUD_SMTP_FROM_EMAIL: 'LinksetGo <account@linksetgo.test>',
      }),
    ).toMatchObject({ status: 'misconfigured' })
  })
})

describe('Cloud SMTP delivery adapter', () => {
  it('uses strict STARTTLS, bounded timeouts, and safe text and HTML verification templates', async () => {
    let options: CloudSMTPTransportOptions | undefined
    let message: Parameters<CloudSMTPTransport['sendMail']>[0] | undefined
    const close = vi.fn()
    const factory: CloudSMTPTransportFactory = (value) => {
      options = value
      return {
        close,
        sendMail: async (valueToSend) => {
          message = valueToSend
          return { accepted: ['owner@example.test'], rejected: [] }
        },
      }
    }
    const sender = createCloudVerificationSender(smtpConfiguration, {
      smtpTransportFactory: factory,
    })

    await sender({
      email: 'owner@example.test',
      expiresAt: '2026-07-31T12:30:00.000Z',
      name: 'Owner <script>&',
      verificationURL: 'https://app.linksetgo.test/verify-email#token=A&B',
    })

    expect(options).toMatchObject({
      connectionTimeout: 8_000,
      debug: false,
      disableFileAccess: true,
      disableUrlAccess: true,
      dnsTimeout: 5_000,
      greetingTimeout: 8_000,
      logger: false,
      requireTLS: true,
      secure: false,
      socketTimeout: 10_000,
      tls: {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true,
        servername: smtpConfiguration.host,
      },
    })
    expect(message).toMatchObject({
      disableFileAccess: true,
      disableUrlAccess: true,
      from: {
        address: smtpConfiguration.fromAddress,
        name: smtpConfiguration.fromName,
      },
      subject: 'Verify your LinksetGo Cloud account',
      to: 'owner@example.test',
    })
    expect(message?.text).toContain('https://app.linksetgo.test/verify-email#token=A&B')
    expect(message?.html).toContain('Owner &lt;script&gt;&amp;')
    expect(message?.html).toContain('#token=A&amp;B')
    expect(close).toHaveBeenCalledOnce()
  })

  it('uses implicit TLS for password reset and hides provider failures', async () => {
    const close = vi.fn()
    let message: Parameters<CloudSMTPTransport['sendMail']>[0] | undefined
    const factory = vi.fn<CloudSMTPTransportFactory>((options) => {
      expect(options).toMatchObject({ requireTLS: false, secure: true })
      return {
        close,
        sendMail: async (valueToSend) => {
          message = valueToSend
          return { accepted: [], rejected: ['owner@example.test'] }
        },
      }
    })
    const sender = createCloudPasswordResetSender(
      {
        ...smtpConfiguration,
        port: 465,
        security: 'implicit-tls',
      },
      { smtpTransportFactory: factory },
    )

    await expect(
      sender({
        email: 'owner@example.test',
        expiresAt: '2026-07-31T12:30:00.000Z',
        name: 'Owner',
        resetURL: 'https://app.linksetgo.test/reset-password#token=secret',
      }),
    ).rejects.toThrow('Cloud email delivery failed.')
    expect(message).toMatchObject({
      subject: 'Reset your LinksetGo Cloud password',
      to: 'owner@example.test',
    })
    expect(message?.text).toContain('https://app.linksetgo.test/reset-password#token=secret')
    expect(message?.html).toContain('Reset password')
    expect(close).toHaveBeenCalledOnce()
  })
})

describe('Cloud webhook delivery adapter', () => {
  it('retains the authenticated HTTPS verification contract', async () => {
    const fetchImplementation = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 202 }),
    )
    const sender = createCloudVerificationSender(
      {
        mode: 'webhook',
        secret: 'w'.repeat(32),
        url: 'https://mailer.linksetgo.test/cloud-email',
      },
      { fetchImplementation: fetchImplementation as typeof fetch },
    )

    await sender({
      email: 'owner@example.test',
      expiresAt: '2026-07-31T12:30:00.000Z',
      name: 'Owner',
      verificationURL: 'https://app.linksetgo.test/verify-email#token=secret',
    })

    expect(fetchImplementation).toHaveBeenCalledOnce()
    const [url, init] = fetchImplementation.mock.calls[0]!
    expect(url).toBe('https://mailer.linksetgo.test/cloud-email')
    expect(init).toMatchObject({
      method: 'POST',
      redirect: 'error',
    })
    expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${'w'.repeat(32)}`)
    expect(JSON.parse(String(init?.body))).toMatchObject({
      email: 'owner@example.test',
      template: 'relay-cloud-verify-email',
    })
  })
})
