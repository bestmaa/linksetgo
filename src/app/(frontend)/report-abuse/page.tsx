import type { Metadata } from 'next'
import { Suspense } from 'react'

import { AbuseReportConnector } from '@/features/abuse-report/abuse-report.connector'

export const metadata: Metadata = {
  description: 'Privately report a phishing, malware, spam or impersonation Relay link.',
  robots: { follow: false, index: false },
  title: 'Report abuse',
}

export default function ReportAbusePage() {
  return (
    <Suspense fallback={null}>
      <AbuseReportConnector />
    </Suspense>
  )
}
