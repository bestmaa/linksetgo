'use client'

import { AbuseReportView } from './abuse-report.view'
import { useAbuseReportController } from './use-abuse-report-controller'

export function AbuseReportConnector({ marketingURL }: { marketingURL: string }) {
  return <AbuseReportView {...useAbuseReportController(marketingURL)} />
}
