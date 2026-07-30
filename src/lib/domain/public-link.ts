import type { App, DeepLink } from '@/payload-types'
import type { PublicLinkPathStyle } from './runtime-link-config'
import { parseLinkParameters, type LinkParameters } from './link-parameters'
import { nativeDeepLinkURL } from './native-scheme'

export type PublicLinkErrorCode =
  | 'APP_INACTIVE'
  | 'APP_NOT_FOUND'
  | 'FALLBACK_UNAVAILABLE'
  | 'INVALID_LINK'
  | 'LINK_EXPIRED'
  | 'LINK_INACTIVE'
  | 'LINK_NOT_FOUND'

export type PublicLinkError = {
  status: 'unavailable'
  error: {
    code: PublicLinkErrorCode
    message: string
  }
}

export type PublicLinkSuccess = {
  status: 'active'
  publicUrl: string
  app: {
    name: string
    slug: string
    appStoreUrl: null | string
    playStoreUrl: null | string
    fallbackUrl: null | string
  }
  link: {
    name: string
    slug: string
    destinationPath: string
    nativeUrl: null | string
    parameters: LinkParameters | null
    fallbackUrl: null | string
    status: 'active'
    expiresAt: null | string
  }
}

export type LinkAvailability =
  | { status: 'active' }
  | { status: 'unavailable'; code: 'APP_INACTIVE' | 'LINK_EXPIRED' | 'LINK_INACTIVE' }

export const isPublicSlug = (value: string): boolean =>
  value.length > 0 && value.length <= 120 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)

export const evaluateLinkAvailability = (
  app: Pick<App, 'platformSuspended' | 'status'>,
  link: Pick<DeepLink, 'expiresAt' | 'platformSuspended' | 'status'>,
  now: Date,
): LinkAvailability => {
  if (app.status !== 'active' || app.platformSuspended) {
    return { status: 'unavailable', code: 'APP_INACTIVE' }
  }
  if (link.status !== 'active' || link.platformSuspended) {
    return { status: 'unavailable', code: 'LINK_INACTIVE' }
  }

  if (link.expiresAt) {
    const expiration = Date.parse(link.expiresAt)
    if (!Number.isFinite(expiration) || expiration <= now.getTime()) {
      return { status: 'unavailable', code: 'LINK_EXPIRED' }
    }
  }

  return { status: 'active' }
}

export const buildPublicURL = (
  baseURL: string,
  appSlug: string,
  linkSlug: string,
  pathStyle: PublicLinkPathStyle = 'host-scoped',
): string => {
  const base = new URL(baseURL)
  const path = `${encodeURIComponent(appSlug)}/${encodeURIComponent(linkSlug)}`
  base.pathname = pathStyle === 'shared-clean' ? `/${path}` : `/l/${path}`
  base.search = ''
  base.hash = ''
  return base.toString().replace(/\/$/, '')
}

const projectPublicParameters = (value: unknown): LinkParameters | null => {
  const result = parseLinkParameters(value)
  return result.ok ? result.value : null
}

export const projectPublicLink = (
  app: App,
  link: DeepLink,
  baseURL: string,
  options: {
    appFallbackUrl?: null | string
    appKey?: string
    linkFallbackUrl?: null | string
    pathStyle?: PublicLinkPathStyle
  } = {},
): PublicLinkSuccess => {
  const parameters = projectPublicParameters(link.parameters)
  return {
    status: 'active',
    publicUrl: buildPublicURL(
      baseURL,
      options.appKey ?? app.slug,
      link.slug,
      options.pathStyle ?? 'host-scoped',
    ),
    app: {
      name: app.name,
      slug: app.slug,
      appStoreUrl: app.appStoreUrl ?? null,
      playStoreUrl: app.playStoreUrl ?? null,
      fallbackUrl:
        options.appFallbackUrl === undefined ? (app.fallbackUrl ?? null) : options.appFallbackUrl,
    },
    link: {
      name: link.name,
      slug: link.slug,
      destinationPath: link.destinationPath,
      nativeUrl: app.nativeScheme
        ? nativeDeepLinkURL({
            destinationPath: link.destinationPath,
            parameters,
            scheme: app.nativeScheme,
          })
        : null,
      parameters,
      fallbackUrl:
        options.linkFallbackUrl === undefined
          ? (link.fallbackUrl ?? null)
          : options.linkFallbackUrl,
      status: 'active',
      expiresAt: link.expiresAt ?? null,
    },
  }
}

const ERROR_MESSAGES: Record<PublicLinkErrorCode, string> = {
  APP_INACTIVE: 'This app is not currently available.',
  APP_NOT_FOUND: 'The requested app was not found.',
  FALLBACK_UNAVAILABLE: 'This link has no currently verified fallback destination.',
  INVALID_LINK: 'The requested deep link is invalid.',
  LINK_EXPIRED: 'This deep link has expired.',
  LINK_INACTIVE: 'This deep link is not currently active.',
  LINK_NOT_FOUND: 'The requested deep link was not found.',
}

export const publicLinkError = (code: PublicLinkErrorCode): PublicLinkError => ({
  status: 'unavailable',
  error: {
    code,
    message: ERROR_MESSAGES[code],
  },
})
