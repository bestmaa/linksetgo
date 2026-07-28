import { createElement } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { normalizeAbuseTarget } from '@/features/abuse-report/abuse-report.helpers'
import { AbuseReportView } from '@/features/abuse-report/abuse-report.view'

afterEach(cleanup)

describe('public abuse-report experience', () => {
  it('prefills only bounded credential-free HTTPS targets without query evidence', () => {
    expect(
      normalizeAbuseTarget('https://links.example.com/l/shop/offer?token=discard#private'),
    ).toBe('https://links.example.com/l/shop/offer')
    expect(normalizeAbuseTarget('http://links.example.com/l/shop/offer')).toBe('')
    expect(normalizeAbuseTarget('https://user:secret@links.example.com/l/shop/offer')).toBe('')
    expect(normalizeAbuseTarget(`https://links.example.com/${'x'.repeat(2_100)}`)).toBe('')
  })

  it('renders the target, category, evidence, optional contact, and generic submit action', () => {
    render(
      createElement(AbuseReportView, {
        error: null,
        form: {
          category: 'phishing',
          details: '',
          reporterContact: '',
          targetURL: 'https://links.example.com/l/shop/offer',
          website: '',
        },
        isAccepted: false,
        isSubmitting: false,
        onFieldChange: vi.fn(),
        onSubmit: vi.fn(),
      }),
    )

    expect(screen.getByRole('heading', { level: 1, name: /Send the exact link/ })).toBeTruthy()
    expect(screen.getByLabelText('Relay HTTPS link')).toBeTruthy()
    expect(screen.getByLabelText('Category')).toBeTruthy()
    expect(screen.getByLabelText('What happened?')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Submit report' })).toBeTruthy()
  })
})
