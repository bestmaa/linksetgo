const localSiteURL = 'http://localhost:3100'

export function getCanonicalSiteURL(): URL {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.PUBLIC_LINK_BASE_URL?.trim()

  if (!configured) {
    return new URL(localSiteURL)
  }

  try {
    const url = new URL(configured)
    const isLoopback =
      url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
    if (
      url.username ||
      url.password ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback))
    ) {
      return new URL(localSiteURL)
    }
    url.pathname = '/'
    url.search = ''
    url.hash = ''
    return url
  } catch {
    return new URL(localSiteURL)
  }
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
