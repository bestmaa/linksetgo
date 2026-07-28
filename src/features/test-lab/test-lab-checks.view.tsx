import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { CheckViewModel } from './test-lab.types'

type TestLabChecksViewProps = {
  checks: readonly CheckViewModel[]
  copyFeedback: string | null
  summary: string
  summaryDetail: string
}

export function TestLabChecksView(props: TestLabChecksViewProps) {
  const hasFailure = props.checks.some((check) => check.status === 'failed')

  return (
    <div className="setting-section">
      <div
        aria-live="polite"
        className={`result-summary ${hasFailure ? 'result-summary-warning' : ''}`}
      >
        <h3>{props.summary}</h3>
        <p>{props.summaryDetail}</p>
      </div>
      <div className="check-list test-check-list">
        {props.checks.map((check) => (
          <div className="result-line test-result-line" key={check.label}>
            <span
              aria-hidden="true"
              className={`result-symbol ${
                check.status === 'failed'
                  ? 'result-symbol-failed'
                  : check.status === 'pending'
                    ? 'result-symbol-pending'
                    : ''
              }`}
            >
              {check.status === 'passed' ? (
                <Icon name="check" size={13} />
              ) : check.status === 'failed' ? (
                <Icon name="x" size={13} />
              ) : (
                '-'
              )}
            </span>
            <span className="status-copy">
              <span className="status-title">{check.label}</span>
              <span className="status-detail">{check.detail}</span>
              {check.remediation ? (
                <span className="check-remediation">
                  <strong>Next step:</strong> {check.remediation}
                </span>
              ) : null}
              {check.copyAction ? (
                <Button
                  className="check-copy-button"
                  onClick={check.copyAction.onCopy}
                  variant="quiet"
                >
                  <Icon name="copy" size={14} />
                  {check.copyAction.label}
                </Button>
              ) : null}
            </span>
          </div>
        ))}
      </div>
      <p aria-live="polite" className="test-copy-feedback" role="status">
        {props.copyFeedback}
      </p>
    </div>
  )
}
