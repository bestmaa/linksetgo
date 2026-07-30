import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TableSkeleton } from '@/components/ui/load-state'

import type { SelectedFallbackOriginViewModel } from './fallback-origins.types'

export function FallbackOriginDetailView(props: {
  origin: SelectedFallbackOriginViewModel
  verificationAvailable: boolean
  verificationMessage: string | null
}) {
  const origin = props.origin
  return (
    <section aria-labelledby="fallback-origin-title" className="card domain-detail-panel">
      <header className="domain-detail-header">
        <div>
          <p className="eyebrow">HTTPS web fallback</p>
          <h2 id="fallback-origin-title">{origin.hostname}</h2>
        </div>
        <Badge tone={origin.statusTone}>{origin.statusLabel}</Badge>
      </header>

      <div className="domain-lifecycle-summary">
        <div>
          <strong>Ownership status</strong>
          <code>{origin.status}</code>
        </div>
        <p>
          {origin.status === 'verified'
            ? 'DNS ownership is verified. Each exact fallback URL must also pass a current independent safety scan before routing.'
            : origin.status === 'revoked'
              ? 'This hostname is revoked. Its fallback is omitted while active native links continue to the neutral or store landing.'
              : 'Publish the exact TXT record below, then ask LinksetGo to verify it.'}
        </p>
        <small>Last trusted DNS check: {origin.lastCheckedLabel}</small>
      </div>

      {origin.verificationError ? (
        <p className="domain-verification-error" role="alert">
          Last verification issue: {origin.verificationError}
        </p>
      ) : null}
      {origin.actionError ? (
        <p className="domain-inline-error" role="alert">
          {origin.actionError}
        </p>
      ) : null}
      {!props.verificationAvailable && origin.status !== 'revoked' ? (
        <p className="domain-inline-error" role="status">
          {props.verificationMessage ?? 'Trusted TXT verification is unavailable.'}
        </p>
      ) : null}

      <section aria-labelledby="fallback-txt-title" className="domain-instructions">
        <div className="domain-section-heading">
          <div>
            <h3 id="fallback-txt-title">Publish this exact DNS record</h3>
            <p>The value is generated server-side and scoped to this hostname.</p>
          </div>
        </div>
        {origin.isLoadingInstructions ? <TableSkeleton rows={3} /> : null}
        {origin.record ? (
          <article className="dns-record">
            <header>
              <Badge tone="blue">TXT</Badge>
              <span>Prove fallback-hostname ownership</span>
            </header>
            <dl>
              <div>
                <dt>Name / host</dt>
                <dd>
                  <code>{origin.record.name}</code>
                  <Button onClick={origin.record.onCopyName} variant="quiet">
                    Copy
                  </Button>
                </dd>
              </div>
              <div>
                <dt>Value</dt>
                <dd>
                  <code>{origin.record.value}</code>
                  <Button onClick={origin.record.onCopyValue} variant="quiet">
                    Copy
                  </Button>
                </dd>
              </div>
            </dl>
          </article>
        ) : null}
        <p className="domain-dns-note">
          LinksetGo resolves only this fixed TXT name through server-side DNS. A configured trusted
          operator adapter can override the built-in resolver. This ownership check never fetches a
          URL supplied by the tenant. It and the exact-URL malware scan are independent gates.
        </p>
      </section>

      {origin.onVerify || origin.onRequestRevoke ? (
        <section className="fallback-origin-actions">
          {origin.onRequestRevoke ? (
            <Button
              disabled={origin.isActionRunning}
              onClick={origin.onRequestRevoke}
              variant="secondary"
            >
              Revoke origin
            </Button>
          ) : null}
          {origin.onVerify ? (
            <Button
              aria-busy={origin.isActionRunning}
              disabled={origin.isActionRunning || !props.verificationAvailable}
              onClick={origin.onVerify}
            >
              {origin.isActionRunning ? 'Checking DNS…' : 'Verify TXT record'}
            </Button>
          ) : null}
        </section>
      ) : null}
    </section>
  )
}
