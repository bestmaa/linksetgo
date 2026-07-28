import type { FormEvent } from 'react'

import type { AbuseCategory } from '@/lib/domain/abuse-report'

export type AbuseReportForm = {
  category: AbuseCategory
  details: string
  reporterContact: string
  targetURL: string
  website: string
}

export type AbuseReportViewProps = {
  error: string | null
  form: AbuseReportForm
  isAccepted: boolean
  isSubmitting: boolean
  onFieldChange: <Key extends keyof AbuseReportForm>(
    field: Key,
    value: AbuseReportForm[Key],
  ) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}
