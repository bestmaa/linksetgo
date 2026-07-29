import type { Metadata } from 'next'
import React from 'react'

import { getCanonicalSiteURL } from '@/lib/server/site-url'

import './styles.css'
import './marketing.css'

export const metadata: Metadata = {
  description: 'Create, validate and operate reliable mobile deep links with LinksetGo.',
  icons: {
    icon: '/brand/linksetgo-mark.svg',
  },
  metadataBase: getCanonicalSiteURL(),
  openGraph: {
    description: 'Create reliable iOS, Android and web routes with LinksetGo.',
    images: [
      {
        alt: 'LinksetGo routes every mobile link to the right destination.',
        height: 630,
        url: '/og-linksetgo.png',
        width: 1200,
      },
    ],
    title: 'LinksetGo — Deep links, done right',
    type: 'website',
  },
  title: {
    default: 'LinksetGo — Deep links, done right',
    template: '%s · LinksetGo',
  },
  twitter: {
    card: 'summary_large_image',
    description: 'Create reliable iOS, Android and web routes with LinksetGo.',
    images: ['/og-linksetgo.png'],
    title: 'LinksetGo — Deep links, done right',
  },
}

export default async function RootLayout(props: { children: React.ReactNode }) {
  const { children } = props

  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
