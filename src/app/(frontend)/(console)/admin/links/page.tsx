import type { Metadata } from 'next'
import { Suspense } from 'react'

import { LinksConnector } from '@/features/links/links.connector'
import { QuickLinksConnector } from '@/features/quick-links/quick-links.connector'

export const metadata: Metadata = {
  title: 'Links',
}

export default function LinksPage() {
  return (
    <Suspense>
      <main className="page">
        <QuickLinksConnector />
        <LinksConnector />
      </main>
    </Suspense>
  )
}
