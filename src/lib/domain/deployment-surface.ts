import { hostnameFromBaseURL } from './request-host'
import { normalizeHostname } from './workspace-domain'

export type DeploymentSurfaceEnvironment = Readonly<Record<string, string | undefined>>

export type DeploymentSurfaceConfig = {
  appOrigin: string | null
  appHostname: string | null
  edition: 'cloud' | 'community'
  managedRootDomain: string | null
  marketingOrigin: string | null
  marketingHostname: string | null
}

export type DeploymentSurfaceDecision =
  { kind: 'allow' } | { kind: 'deny' } | { kind: 'redirect'; destination: string }

const marketingPathPrefixes = [
  '/changelog',
  '/docs',
  '/open-source',
  '/pricing',
  '/privacy',
  '/report-abuse',
  '/security',
  '/sponsor',
  '/status',
  '/terms',
] as const

const appPathPrefixes = [
  '/admin',
  '/cms',
  '/forgot-password',
  '/invite',
  '/resend-verification',
  '/reset-password',
  '/signup',
  '/verify-email',
] as const

const staticPathPrefixes = [
  '/_next',
  '/brand',
  '/favicon.ico',
  '/og-linksetgo.png',
  '/og.png',
] as const
const metadataPaths = ['/robots.txt', '/sitemap.xml'] as const

const matchesPrefix = (pathname: string, prefix: string): boolean =>
  pathname === prefix || pathname.startsWith(`${prefix}/`)

const matchesAnyPrefix = (pathname: string, prefixes: readonly string[]): boolean =>
  prefixes.some((prefix) => matchesPrefix(pathname, prefix))

const safeWebOrigin = (value: string | undefined): string | null => {
  if (!value?.trim()) return null

  try {
    const url = new URL(value.trim())
    const isLoopback =
      url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
    if (
      url.username ||
      url.password ||
      url.protocol !== (isLoopback ? 'http:' : 'https:') ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) {
      return null
    }
    return url.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

export function getDeploymentSurfaceConfig(
  environment: DeploymentSurfaceEnvironment = process.env,
): DeploymentSurfaceConfig {
  const edition =
    environment.RELAY_EDITION?.trim().toLowerCase() === 'cloud' ? 'cloud' : 'community'
  const managedRootDomain = normalizeHostname(environment.MANAGED_LINK_ROOT_DOMAIN)
  const appOrigin =
    edition === 'cloud'
      ? (safeWebOrigin(environment.CLOUD_APP_BASE_URL) ??
        safeWebOrigin(environment.PUBLIC_LINK_BASE_URL) ??
        safeWebOrigin(environment.NEXT_PUBLIC_SITE_URL))
      : (safeWebOrigin(environment.PUBLIC_LINK_BASE_URL) ??
        safeWebOrigin(environment.NEXT_PUBLIC_SITE_URL))
  const marketingOrigin =
    safeWebOrigin(environment.MARKETING_SITE_URL) ??
    safeWebOrigin(environment.NEXT_PUBLIC_SITE_URL) ??
    (edition === 'cloud' && managedRootDomain ? `https://${managedRootDomain}` : null)

  return {
    appOrigin,
    appHostname: appOrigin ? hostnameFromBaseURL(appOrigin) : null,
    edition,
    managedRootDomain,
    marketingOrigin,
    marketingHostname: marketingOrigin ? hostnameFromBaseURL(marketingOrigin) : null,
  }
}

const withPath = (origin: string, pathname: string, search: string): string => {
  const url = new URL(origin)
  url.pathname = pathname
  url.search = search
  return url.toString()
}

const isMarketingHostname = (hostname: string, config: DeploymentSurfaceConfig): boolean =>
  hostname === config.marketingHostname ||
  (config.marketingHostname !== null && hostname === `www.${config.marketingHostname}`)

const isLoopbackHostname = (hostname: string): boolean =>
  hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'

const isReadMethod = (method: string): boolean => method === 'GET' || method === 'HEAD'

const publicSurfaceAllowed = (pathname: string, method: string): boolean => {
  if (isReadMethod(method) && matchesAnyPrefix(pathname, staticPathPrefixes)) return true
  if (isReadMethod(method) && matchesPrefix(pathname, '/l')) return true
  if (isReadMethod(method) && matchesPrefix(pathname, '/.well-known')) return true
  if (method === 'GET' && matchesPrefix(pathname, '/api/public/links')) return true
  if (method === 'POST' && pathname === '/api/public/link-events') return true
  if (method === 'POST' && pathname === '/api/public/abuse-reports') return true
  return isReadMethod(method) && pathname === '/report-abuse'
}

export function decideDeploymentSurface(input: {
  config: DeploymentSurfaceConfig
  hostname: string
  method?: string
  pathname: string
  search?: string
}): DeploymentSurfaceDecision {
  const { config, pathname } = input
  const hostname = normalizeHostname(input.hostname)
  const method = (input.method ?? 'GET').toUpperCase()
  const search = input.search ?? ''
  if (!hostname) return { kind: 'deny' }

  if (config.edition === 'community') {
    const isApplicationHost = hostname === config.appHostname || isLoopbackHostname(hostname)
    if (!isApplicationHost) {
      return publicSurfaceAllowed(pathname, method) ? { kind: 'allow' } : { kind: 'deny' }
    }
    if (pathname === '/' && isReadMethod(method)) {
      return { kind: 'redirect', destination: '/admin/login' }
    }
    if (matchesPrefix(pathname, '/pricing') && isReadMethod(method)) {
      return { kind: 'redirect', destination: '/admin/settings' }
    }
    return { kind: 'allow' }
  }

  const isAppHost =
    hostname === config.appHostname || (config.appHostname === null && isLoopbackHostname(hostname))
  if (isAppHost) {
    if (pathname === '/' && isReadMethod(method)) {
      return { kind: 'redirect', destination: '/admin/login' }
    }
    if (
      isReadMethod(method) &&
      (matchesAnyPrefix(pathname, marketingPathPrefixes) ||
        metadataPaths.some((path) => path === pathname)) &&
      config.marketingOrigin
    ) {
      return {
        kind: 'redirect',
        destination: withPath(config.marketingOrigin, pathname, search),
      }
    }
    if (
      matchesPrefix(pathname, '/l') ||
      matchesPrefix(pathname, '/.well-known') ||
      matchesPrefix(pathname, '/api/public')
    ) {
      return { kind: 'deny' }
    }
    if (
      matchesAnyPrefix(pathname, appPathPrefixes) ||
      matchesPrefix(pathname, '/api') ||
      matchesAnyPrefix(pathname, staticPathPrefixes)
    ) {
      return { kind: 'allow' }
    }
    return { kind: 'deny' }
  }

  if (isMarketingHostname(hostname, config)) {
    if (isReadMethod(method) && matchesAnyPrefix(pathname, appPathPrefixes) && config.appOrigin) {
      return { kind: 'redirect', destination: withPath(config.appOrigin, pathname, search) }
    }
    if (method === 'POST' && pathname === '/api/public/abuse-reports') {
      return { kind: 'allow' }
    }
    if (method === 'GET' && matchesPrefix(pathname, '/api/health')) {
      return { kind: 'allow' }
    }
    if (
      isReadMethod(method) &&
      (pathname === '/' ||
        matchesAnyPrefix(pathname, marketingPathPrefixes) ||
        matchesAnyPrefix(pathname, staticPathPrefixes) ||
        metadataPaths.some((path) => path === pathname))
    ) {
      return { kind: 'allow' }
    }
    return { kind: 'deny' }
  }

  return publicSurfaceAllowed(pathname, method) ? { kind: 'allow' } : { kind: 'deny' }
}
