const localSiteURL = 'http://localhost:3100'

type SiteURLEnvironment = Readonly<Record<string, string | undefined>>

const safeWebOrigin = (configuredValue: string | undefined): URL | null => {
  if (!configuredValue?.trim()) return null

  try {
    const url = new URL(configuredValue.trim())
    const isLoopback =
      url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
    if (
      url.username ||
      url.password ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback))
    ) {
      return null
    }
    url.pathname = '/'
    url.search = ''
    url.hash = ''
    return url
  } catch {
    return null
  }
}

const firstSafeOrigin = (...configuredValues: (string | undefined)[]): URL =>
  configuredValues.reduce<URL | null>(
    (selected, configuredValue) => selected ?? safeWebOrigin(configuredValue),
    null,
  ) ?? new URL(localSiteURL)

export function getMarketingSiteURL(environment: SiteURLEnvironment = process.env): URL {
  return firstSafeOrigin(
    environment.MARKETING_SITE_URL,
    environment.NEXT_PUBLIC_SITE_URL,
    environment.PUBLIC_LINK_BASE_URL,
  )
}

export function getApplicationSiteURL(environment: SiteURLEnvironment = process.env): URL {
  const isCloud = environment.RELAY_EDITION?.trim().toLowerCase() === 'cloud'
  return isCloud
    ? firstSafeOrigin(
        environment.CLOUD_APP_BASE_URL,
        environment.PUBLIC_LINK_BASE_URL,
        environment.NEXT_PUBLIC_SITE_URL,
      )
    : firstSafeOrigin(environment.PUBLIC_LINK_BASE_URL, environment.NEXT_PUBLIC_SITE_URL)
}

/**
 * Compatibility alias for callers that need the public marketing origin.
 * Security-sensitive application callers must use getApplicationSiteURL.
 */
export function getCanonicalSiteURL(): URL {
  return getMarketingSiteURL()
}

export function getSponsorURL(
  configuredValue: string | undefined = process.env.SPONSOR_URL,
): string | null {
  return getCredentialFreeHTTPSURL(configuredValue)
}

export function getSourceCodeURL(
  configuredValue: string | undefined = process.env.SOURCE_CODE_URL,
): string | null {
  return getCredentialFreeHTTPSURL(configuredValue)
}

function getCredentialFreeHTTPSURL(configuredValue: string | undefined): string | null {
  if (!configuredValue?.trim()) return null

  try {
    const url = new URL(configuredValue)
    if (url.protocol !== 'https:' || url.username || url.password) return null
    return url.toString()
  } catch {
    return null
  }
}
