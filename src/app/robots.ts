import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'

import { getDeploymentSurfaceConfig } from '@/lib/domain/deployment-surface'
import { requestHostname } from '@/lib/domain/request-host'
import { getCanonicalSiteURL } from '@/lib/server/site-url'

export default async function robots(): Promise<MetadataRoute.Robots> {
  const requestHost = requestHostname(
    await headers(),
    process.env.TRUST_PROXY_HOST_HEADER?.trim().toLowerCase() === 'true',
  )
  const surfaceConfig = getDeploymentSurfaceConfig()
  if (requestHost.ok && requestHost.hostname === surfaceConfig.sharedLinkHostname) {
    return {
      rules: {
        disallow: '/',
        userAgent: '*',
      },
    }
  }

  const origin = getCanonicalSiteURL()

  return {
    rules: {
      allow: '/',
      disallow: ['/admin/', '/api/', '/cms/'],
      userAgent: '*',
    },
    sitemap: new URL('/sitemap.xml', origin).toString(),
  }
}
