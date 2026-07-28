import Link from 'next/link'

import { BrandMark } from '@/components/ui/brand-mark'

import type { AbuseReportViewProps } from './abuse-report.types'

export function AbuseReportView(props: AbuseReportViewProps) {
  return (
    <main className="marketing-inner abuse-report-page">
      <section className="marketing-container abuse-report-shell">
        <Link className="marketing-brand" href="/">
          <BrandMark className="marketing-brand-mark" />
          <span>
            <strong>Relay</strong>
            <small>TRUST &amp; SAFETY</small>
          </span>
        </Link>

        <div className="abuse-report-card">
          <header>
            <div className="marketing-pill">Report a harmful Relay link</div>
            <h1>Send the exact link for private review.</h1>
            <p>
              Use this form for phishing, malware, spam or impersonation on a Relay-operated link.
              Do not include passwords, payment details or other secrets.
            </p>
          </header>

          {props.isAccepted ? (
            <section aria-live="polite" className="abuse-report-accepted">
              <h2>Report received</h2>
              <p>
                If the URL matches a Relay resource, the operator&apos;s trust team can review it.
                This response does not confirm whether the target exists.
              </p>
              <Link className="marketing-secondary" href="/">
                Return to Relay
              </Link>
            </section>
          ) : (
            <form className="abuse-report-form" onSubmit={props.onSubmit}>
              <label htmlFor="abuse-target">
                Relay HTTPS link
                <input
                  autoComplete="url"
                  id="abuse-target"
                  maxLength={2048}
                  onChange={(event) => props.onFieldChange('targetURL', event.currentTarget.value)}
                  placeholder="https://links.example.com/l/app/link"
                  required
                  type="url"
                  value={props.form.targetURL}
                />
              </label>
              <label htmlFor="abuse-category">
                Category
                <select
                  id="abuse-category"
                  onChange={(event) =>
                    props.onFieldChange(
                      'category',
                      event.currentTarget.value as AbuseReportViewProps['form']['category'],
                    )
                  }
                  value={props.form.category}
                >
                  <option value="phishing">Phishing</option>
                  <option value="malware">Malware</option>
                  <option value="impersonation">Impersonation</option>
                  <option value="spam">Spam</option>
                  <option value="other">Other harmful use</option>
                </select>
              </label>
              <label htmlFor="abuse-details">
                What happened?
                <textarea
                  id="abuse-details"
                  maxLength={4000}
                  minLength={10}
                  onChange={(event) => props.onFieldChange('details', event.currentTarget.value)}
                  placeholder="Describe the behavior and why the link may be harmful."
                  required
                  rows={7}
                  value={props.form.details}
                />
              </label>
              <label htmlFor="abuse-contact">
                Contact email <span>(optional)</span>
                <input
                  autoComplete="email"
                  id="abuse-contact"
                  maxLength={320}
                  onChange={(event) =>
                    props.onFieldChange('reporterContact', event.currentTarget.value)
                  }
                  type="email"
                  value={props.form.reporterContact}
                />
              </label>
              <label aria-hidden="true" className="abuse-honeypot" htmlFor="abuse-website">
                Website
                <input
                  autoComplete="off"
                  id="abuse-website"
                  onChange={(event) => props.onFieldChange('website', event.currentTarget.value)}
                  tabIndex={-1}
                  value={props.form.website}
                />
              </label>
              {props.error ? (
                <p className="abuse-report-error" role="alert">
                  {props.error}
                </p>
              ) : null}
              <button className="marketing-cta" disabled={props.isSubmitting} type="submit">
                {props.isSubmitting ? 'Sending report…' : 'Submit report'}
              </button>
              <p className="abuse-report-privacy">
                Relay stores a privacy-safe request hash, not a raw client IP, in application data.
              </p>
            </form>
          )}
        </div>
      </section>
    </main>
  )
}
