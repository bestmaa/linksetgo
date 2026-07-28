import 'server-only'

import { getApplicationSiteURL } from './site-url'

export function isSameOriginMutation(
  request: Request,
  expectedOrigin: string = getApplicationSiteURL().origin,
): boolean {
  const fetchSite = request.headers.get('sec-fetch-site')?.trim().toLowerCase()
  if (fetchSite && fetchSite !== 'same-origin') return false

  const suppliedOrigin = request.headers.get('origin')?.trim()
  if (!suppliedOrigin || suppliedOrigin === 'null') return false

  try {
    return new URL(suppliedOrigin).origin === new URL(expectedOrigin).origin
  } catch {
    return false
  }
}
