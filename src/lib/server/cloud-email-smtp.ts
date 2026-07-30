import 'server-only'

import nodemailer from 'nodemailer'
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js'

import type { PasswordResetSender } from './account-recovery-service'
import type { CloudEmailDeliveryConfiguration } from './cloud-signup-config'
import type { VerificationSender } from './cloud-signup-service'

type SMTPConfiguration = Extract<CloudEmailDeliveryConfiguration, { mode: 'smtp' }>

export type CloudSMTPTransportOptions = {
  auth: {
    pass: string
    user: string
  }
  connectionTimeout: number
  debug: false
  disableFileAccess: true
  disableUrlAccess: true
  dnsTimeout: number
  greetingTimeout: number
  host: string
  logger: false
  pool: false
  port: number
  requireTLS: boolean
  secure: boolean
  socketTimeout: number
  tls: {
    minVersion: 'TLSv1.2'
    rejectUnauthorized: true
    servername: string
  }
}

type CloudSMTPMessage = {
  disableFileAccess: true
  disableUrlAccess: true
  from: {
    address: string
    name: string
  }
  html: string
  subject: string
  text: string
  to: string
}

export type CloudSMTPTransport = {
  close?(): void
  sendMail(message: CloudSMTPMessage): Promise<{
    accepted: readonly unknown[]
    rejected: readonly unknown[]
  }>
}

export type CloudSMTPTransportFactory = (options: CloudSMTPTransportOptions) => CloudSMTPTransport

const defaultTransportFactory: CloudSMTPTransportFactory = (options) => {
  const transportOptions = options satisfies SMTPTransport.Options
  const transport = nodemailer.createTransport(transportOptions)
  return {
    close: () => transport.close(),
    sendMail: async (message) => {
      const result = await transport.sendMail(message)
      return {
        accepted: result.accepted,
        rejected: result.rejected,
      }
    },
  }
}

const htmlEscape = (value: string): string =>
  value.replace(
    /[&<>"']/gu,
    (character) =>
      (
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        }) as const
      )[character as '&' | '<' | '>' | '"' | "'"],
  )

const safeDisplayName = (value: string): string => {
  const normalized = value.replace(/[\u0000-\u001f\u007f]/gu, ' ').trim()
  return normalized.slice(0, 100) || 'there'
}

const safeActionURL = (value: string): string => {
  const url = new URL(value)
  const loopback =
    url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
  if (
    url.username ||
    url.password ||
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))
  ) {
    throw new Error('Email delivery received an invalid action URL.')
  }
  return url.toString()
}

const safeRecipient = (value: string): string => {
  const candidate = value.trim()
  if (
    !candidate ||
    candidate.length > 254 ||
    /[\s<>(){},;:\\"]/u.test(candidate) ||
    candidate.lastIndexOf('@') < 1
  ) {
    throw new Error('Email delivery received an invalid recipient.')
  }
  return candidate
}

const formatExpiry = (value: string): string => {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime()))
    throw new Error('Email delivery received an invalid expiry.')
  return date.toISOString().replace('T', ' ').replace('.000Z', ' UTC')
}

const transportOptions = (configuration: SMTPConfiguration): CloudSMTPTransportOptions => ({
  auth: {
    pass: configuration.password,
    user: configuration.username,
  },
  connectionTimeout: 8_000,
  debug: false,
  disableFileAccess: true,
  disableUrlAccess: true,
  dnsTimeout: 5_000,
  greetingTimeout: 8_000,
  host: configuration.host,
  logger: false,
  pool: false,
  port: configuration.port,
  requireTLS: configuration.security === 'starttls',
  secure: configuration.security === 'implicit-tls',
  socketTimeout: 10_000,
  tls: {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: true,
    servername: configuration.host,
  },
})

const send = async (
  configuration: SMTPConfiguration,
  factory: CloudSMTPTransportFactory,
  message: Omit<CloudSMTPMessage, 'disableFileAccess' | 'disableUrlAccess' | 'from'>,
): Promise<void> => {
  let transport: CloudSMTPTransport | undefined
  try {
    transport = factory(transportOptions(configuration))
    const result = await transport.sendMail({
      ...message,
      disableFileAccess: true,
      disableUrlAccess: true,
      from: {
        address: configuration.fromAddress,
        name: configuration.fromName,
      },
    })
    if (result.accepted.length === 0 || result.rejected.length > 0) {
      throw new Error('SMTP provider rejected the recipient.')
    }
  } catch {
    throw new Error('Cloud email delivery failed.')
  } finally {
    try {
      transport?.close?.()
    } catch {
      // Closing a failed provider must not leak transport details or replace the delivery result.
    }
  }
}

export function createSMTPVerificationSender(
  configuration: SMTPConfiguration,
  factory: CloudSMTPTransportFactory = defaultTransportFactory,
): VerificationSender {
  return async (delivery) => {
    const name = safeDisplayName(delivery.name)
    const actionURL = safeActionURL(delivery.verificationURL)
    const expiry = formatExpiry(delivery.expiresAt)
    await send(configuration, factory, {
      html: `<p>Hello ${htmlEscape(name)},</p><p>Verify your email to activate your LinksetGo Cloud account.</p><p><a href="${htmlEscape(actionURL)}">Verify email</a></p><p>This one-time link expires at ${htmlEscape(expiry)}.</p><p>If you did not create this account, you can ignore this message.</p>`,
      subject: 'Verify your LinksetGo Cloud account',
      text: `Hello ${name},\n\nVerify your email to activate your LinksetGo Cloud account:\n${actionURL}\n\nThis one-time link expires at ${expiry}.\n\nIf you did not create this account, you can ignore this message.`,
      to: safeRecipient(delivery.email),
    })
  }
}

export function createSMTPPasswordResetSender(
  configuration: SMTPConfiguration,
  factory: CloudSMTPTransportFactory = defaultTransportFactory,
): PasswordResetSender {
  return async (delivery) => {
    const name = safeDisplayName(delivery.name)
    const actionURL = safeActionURL(delivery.resetURL)
    const expiry = formatExpiry(delivery.expiresAt)
    await send(configuration, factory, {
      html: `<p>Hello ${htmlEscape(name)},</p><p>Use the secure link below to reset your LinksetGo Cloud password.</p><p><a href="${htmlEscape(actionURL)}">Reset password</a></p><p>This one-time link expires at ${htmlEscape(expiry)}.</p><p>If you did not request a reset, you can ignore this message.</p>`,
      subject: 'Reset your LinksetGo Cloud password',
      text: `Hello ${name},\n\nReset your LinksetGo Cloud password:\n${actionURL}\n\nThis one-time link expires at ${expiry}.\n\nIf you did not request a reset, you can ignore this message.`,
      to: safeRecipient(delivery.email),
    })
  }
}
