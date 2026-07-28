import type { CollectionBeforeValidateHook } from 'payload'
import { APIError } from 'payload'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const relationID = (value: unknown): null | number => {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value)
  if (!isRecord(value)) return null
  return relationID(value.id)
}

export const fallbackHostnameFromURL = (value: unknown): null | string => {
  if (typeof value !== 'string' || !value) return null

  try {
    const url = new URL(value)
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      url.port === '' &&
      url.hostname
      ? url.hostname.toLowerCase().replace(/\.$/, '')
      : null
  } catch {
    return null
  }
}

export const normalizedFallbackHostnames = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .filter((host): host is string => typeof host === 'string')
        .map((host) => host.trim().toLowerCase().replace(/\.$/, ''))
        .filter(Boolean)
    : []

const isDevelopmentHost = (hostname: string, environment: string | undefined): boolean =>
  environment !== 'production' &&
  (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]')

export const isFallbackURLAllowed = (
  fallbackURL: string,
  allowedHosts: readonly string[],
  environment = process.env.NODE_ENV,
): boolean => {
  const hostname = fallbackHostnameFromURL(fallbackURL)
  if (!hostname) return false
  return (
    normalizedFallbackHostnames(allowedHosts).includes(hostname) ||
    isDevelopmentHost(hostname, environment)
  )
}

export const relationIDsMatch = (left: unknown, right: unknown): boolean => {
  const leftID = relationID(left)
  const rightID = relationID(right)
  return leftID !== null && leftID === rightID
}

export const normalizeAppFallbackHosts: CollectionBeforeValidateHook = ({ data, originalDoc }) => {
  if (!isRecord(data)) return data

  const previous = isRecord(originalDoc) ? originalDoc : {}
  const fallbackUrl = data.fallbackUrl ?? previous.fallbackUrl
  const fallbackHost = fallbackHostnameFromURL(fallbackUrl)
  const suppliedHosts = normalizedFallbackHostnames(
    data.allowedFallbackHosts ?? previous.allowedFallbackHosts,
  )

  return {
    ...data,
    allowedFallbackHosts: [
      ...new Set(fallbackHost ? [...suppliedHosts, fallbackHost] : suppliedHosts),
    ],
  }
}

export const enforceDeepLinkFallbackHost: CollectionBeforeValidateHook = async ({
  data,
  originalDoc,
  req,
}) => {
  const next = isRecord(data) ? data : {}
  const previous = isRecord(originalDoc) ? originalDoc : {}
  const fallbackUrl = next.fallbackUrl ?? previous.fallbackUrl

  if (fallbackUrl === null || fallbackUrl === undefined || fallbackUrl === '') return data

  const hostname = fallbackHostnameFromURL(fallbackUrl)
  if (!hostname) throw new APIError('Fallback URL must be a valid HTTPS URL.', 400)

  const appID = relationID(next.app ?? previous.app)
  if (!appID) throw new APIError('Select an app before setting a fallback URL.', 400)

  const app = await req.payload.findByID({
    collection: 'apps',
    id: appID,
    depth: 0,
    overrideAccess: true,
  })
  const allowedHosts = normalizedFallbackHostnames(app.allowedFallbackHosts)

  if (!isFallbackURLAllowed(fallbackUrl as string, allowedHosts)) {
    throw new APIError(`Fallback hostname "${hostname}" is not allowed for this app.`, 400)
  }

  return data
}

export const enforceVerificationLinkApp: CollectionBeforeValidateHook = async ({
  data,
  originalDoc,
  req,
}) => {
  const next = isRecord(data) ? data : {}
  const previous = isRecord(originalDoc) ? originalDoc : {}
  const linkValue = Object.hasOwn(next, 'link') ? next.link : previous.link
  const linkID = relationID(linkValue)

  if (!linkID) return data

  const appID = relationID(next.app ?? previous.app)
  if (!appID) throw new APIError('A verification link requires an app.', 400)

  const link = await req.payload.findByID({
    collection: 'deep-links',
    id: linkID,
    depth: 0,
    overrideAccess: true,
  })
  const linkAppID = relationID(link.app)

  if (!relationIDsMatch(linkAppID, appID)) {
    throw new APIError('The verification link must belong to the selected app.', 400)
  }

  return data
}
