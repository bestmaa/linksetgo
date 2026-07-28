import type { MetadataRoute } from 'next'

import { getCanonicalSiteURL } from '@/lib/server/site-url'

export default function robots(): MetadataRoute.Robots {
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
