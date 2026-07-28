import type { Metadata } from 'next'
import React from 'react'

import { getCanonicalSiteURL } from '@/lib/server/site-url'

import './styles.css'
import './marketing.css'

export const metadata: Metadata = {
  description:
    'Create, validate and operate reliable mobile deep links with open-source infrastructure.',
  icons: {
    icon: '/brand/relay-mark.svg',
  },
  metadataBase: getCanonicalSiteURL(),
  openGraph: {
    description: 'Create reliable iOS, Android and web routes with self-hosted Relay Community.',
    images: [
      {
        alt: 'Relay routes one public link to iOS, Android and web destinations.',
        height: 909,
        url: '/og.png',
        width: 1731,
      },
    ],
    title: 'Open-source deep-link infrastructure.',
    type: 'website',
  },
  title: {
    default: 'Relay - Open-source deep-link infrastructure',
    template: '%s · Relay',
  },
  twitter: {
    card: 'summary_large_image',
    description: 'Create reliable iOS, Android and web routes with self-hosted Relay Community.',
    images: ['/og.png'],
    title: 'Open-source deep-link infrastructure.',
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
