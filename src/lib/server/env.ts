import { normalizeHostname } from '@/lib/domain/workspace-domain'

export type ServerEnvironment = {
  databaseURL: string
  eventHashSecret: string
  managedIngressCnameTarget: null | string
  managedLinkRootDomain: null | string
  payloadSecret: string
  publicLinkBaseURL: string
  trustProxyClientIPHeader: boolean
  trustProxyHostHeader: boolean
}

let cachedEnvironment: ServerEnvironment | undefined

const required = (name: string): string => {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required server environment variable: ${name}`)
  return value
}

const validateSecret = (name: string, value: string): string => {
  if (value.length < 32) {
    throw new Error(`${name} must contain at least 32 characters.`)
  }
  return value
}

const validateDatabaseURL = (value: string): string => {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL.')
  }

  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error('DATABASE_URL must use the postgres protocol.')
  }
  if (!url.username || url.pathname === '/' || !url.pathname) {
    throw new Error('DATABASE_URL must identify a project role and database.')
  }
  if (['postgres', 'postgres_admin'].includes(decodeURIComponent(url.username).toLowerCase())) {
    throw new Error('DATABASE_URL must not use the shared PostgreSQL administrator role.')
  }
  return value
}

const validatePublicBaseURL = (value: string): string => {
  const url = new URL(value)
  const isLocal =
    url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'

  if (url.username || url.password) {
    throw new Error('PUBLIC_LINK_BASE_URL must not contain credentials.')
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocal)) {
    throw new Error('PUBLIC_LINK_BASE_URL must use HTTPS unless it targets a loopback host.')
  }

  url.pathname = ''
  url.search = ''
  url.hash = ''
  return url.toString().replace(/\/$/, '')
}

const optionalHostname = (name: string): null | string => {
  const value = process.env[name]?.trim()
  if (!value) return null

  const hostname = normalizeHostname(value)
  if (!hostname) throw new Error(`${name} must be one exact hostname without a scheme or wildcard.`)
  return hostname
}

const optionalBoolean = (name: string): boolean => {
  const value = process.env[name]?.trim().toLowerCase()
  if (!value || value === 'false') return false
  if (value === 'true') return true
  throw new Error(`${name} must be either "true" or "false".`)
}

export const getServerEnvironment = (): ServerEnvironment => {
  if (cachedEnvironment) return cachedEnvironment

  const payloadSecret = validateSecret('PAYLOAD_SECRET', required('PAYLOAD_SECRET'))
  const eventHashSecret = process.env.EVENT_HASH_SECRET?.trim() || payloadSecret
  cachedEnvironment = {
    databaseURL: validateDatabaseURL(required('DATABASE_URL')),
    eventHashSecret: validateSecret('EVENT_HASH_SECRET', eventHashSecret),
    managedIngressCnameTarget: optionalHostname('MANAGED_INGRESS_CNAME_TARGET'),
    managedLinkRootDomain: optionalHostname('MANAGED_LINK_ROOT_DOMAIN'),
    payloadSecret,
    publicLinkBaseURL: validatePublicBaseURL(required('PUBLIC_LINK_BASE_URL')),
    trustProxyClientIPHeader: optionalBoolean('TRUST_PROXY_CLIENT_IP_HEADER'),
    trustProxyHostHeader: optionalBoolean('TRUST_PROXY_HOST_HEADER'),
  }
  return cachedEnvironment
}
