import type { MetadataRoute } from 'next'

import { getCanonicalSiteURL } from '@/lib/server/site-url'

const publicRoutes = [
  '/',
  '/pricing',
  '/docs',
  '/docs/react-native',
  '/docs/custom-domains',
  '/docs/self-hosting',
  '/open-source',
  '/security',
  '/changelog',
  '/sponsor',
  '/status',
  '/privacy',
  '/terms',
] as const

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = getCanonicalSiteURL()

  return publicRoutes.map((path) => ({
    changeFrequency: path === '/changelog' ? 'weekly' : 'monthly',
    priority: path === '/' ? 1 : path === '/docs' ? 0.8 : 0.7,
    url: new URL(path, origin).toString(),
  }))
}
