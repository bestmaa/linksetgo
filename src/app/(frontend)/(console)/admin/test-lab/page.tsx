import type { Metadata } from 'next'
import { Suspense } from 'react'

import { TestLabConnector } from '@/features/test-lab/test-lab.connector'

export const metadata: Metadata = {
  title: 'Test Lab',
}

export default function TestLabPage() {
  return (
    <Suspense>
      <TestLabConnector />
    </Suspense>
  )
}
