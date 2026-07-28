import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import path from 'path'
import { fileURLToPath } from 'url'

import { buildContentSecurityPolicy } from './src/lib/domain/security-headers'

const __filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(__filename)
const allowedDevOrigin = process.env.RELAY_ALLOWED_DEV_ORIGIN?.trim()
const isProduction = process.env.NODE_ENV === 'production'
const allowedDevOrigins = ['127.0.0.1', ...(allowedDevOrigin ? [allowedDevOrigin] : [])]
const securityHeaders = [
  { key: 'Content-Security-Policy', value: buildContentSecurityPolicy(isProduction) },
  { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=()' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  { key: 'X-Frame-Options', value: 'DENY' },
  ...(isProduction ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000' }] : []),
]

const nextConfig: NextConfig = {
  ...(!isProduction ? { allowedDevOrigins } : {}),
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
  output: 'standalone',
  poweredByHeader: false,
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }

    return webpackConfig
  },
  turbopack: {
    root: path.resolve(dirname),
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
