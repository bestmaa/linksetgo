import type { Metadata } from 'next'
import { Suspense } from 'react'

import { LinksConnector } from '@/features/links/links.connector'

export const metadata: Metadata = {
  title: 'Links',
}

export default function LinksPage() {
  return (
    <Suspense>
      <LinksConnector />
    </Suspense>
  )
}
