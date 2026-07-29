'use client'

import { useSearchParams } from 'next/navigation'
import { type FormEvent, useState } from 'react'

import { MAX_ABUSE_REPORT_BODY_BYTES } from '@/lib/domain/abuse-report'

import type { AbuseReportForm, AbuseReportViewProps } from './abuse-report.types'
import { normalizeAbuseTarget, validOptionalContact } from './abuse-report.helpers'

const initialForm = (target: string): AbuseReportForm => ({
  category: 'phishing',
  details: '',
  reporterContact: '',
  targetURL: target,
  website: '',
})

export function useAbuseReportController(marketingURL: string): AbuseReportViewProps {
  const searchParams = useSearchParams()
  const [form, setForm] = useState<AbuseReportForm>(() =>
    initialForm(normalizeAbuseTarget(searchParams.get('target'))),
  )
  const [error, setError] = useState<string | null>(null)
  const [isAccepted, setIsAccepted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const onFieldChange: AbuseReportViewProps['onFieldChange'] = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
    setError(null)
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSubmitting || isAccepted) return

    const targetURL = normalizeAbuseTarget(form.targetURL)
    const details = form.details.trim()
    if (!targetURL || details.length < 10 || details.length > 4_000) {
      setError('Enter a valid LinksetGo HTTPS link and a description of 10–4,000 characters.')
      return
    }
    if (!validOptionalContact(form.reporterContact)) {
      setError('Enter a valid contact email or leave it blank.')
      return
    }

    setError(null)
    setIsSubmitting(true)
    try {
      const requestBody = JSON.stringify({
        category: form.category,
        details,
        reporterContact: form.reporterContact.trim(),
        targetURL,
        website: form.website,
      })
      if (new TextEncoder().encode(requestBody).byteLength > MAX_ABUSE_REPORT_BODY_BYTES) {
        setError('Shorten the report so it can be submitted safely.')
        return
      }
      const response = await fetch('/api/public/abuse-reports', {
        body: requestBody,
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
      if (response.status !== 202) {
        throw new Error('Report rejected')
      }
      setIsAccepted(true)
    } catch {
      setError('The report could not be accepted. Please try again later.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return {
    error,
    form,
    isAccepted,
    isSubmitting,
    marketingURL,
    onFieldChange,
    onSubmit,
  }
}
