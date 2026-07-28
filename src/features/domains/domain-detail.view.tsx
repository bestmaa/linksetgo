import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TableSkeleton } from '@/components/ui/load-state'

import type { DomainInstructionRecordViewModel, SelectedDomainViewModel } from './domains.types'

function DNSRecordView({ record }: { record: DomainInstructionRecordViewModel }) {
  return (
    <article className="dns-record">
      <header>
        <Badge tone="blue">{record.type}</Badge>
        <span>{record.type === 'CNAME' ? 'Route traffic' : 'Prove ownership'}</span>
      </header>
      <dl>
        <div>
          <dt>Name / host</dt>
          <dd>
            <code>{record.name}</code>
            <Button
              aria-label={`Copy ${record.type} name`}
              onClick={record.onCopyName}
              variant="quiet"
            >
              Copy
            </Button>
          </dd>
        </div>
        <div>
          <dt>Target / value</dt>
          <dd>
            <code>{record.value}</code>
            <Button
              aria-label={`Copy ${record.type} value`}
              onClick={record.onCopyValue}
              variant="quiet"
            >
              Copy
            </Button>
          </dd>
        </div>
      </dl>
    </article>
  )
}

export function DomainDetailView({ domain }: { domain: SelectedDomainViewModel }) {
  return (
    <section aria-labelledby="selected-domain-title" className="card domain-detail-panel">
      <header className="domain-detail-header">
        <div>
          <p className="eyebrow">{domain.typeLabel}</p>
          <h2 id="selected-domain-title">{domain.hostname}</h2>
        </div>
        <Badge tone={domain.statusTone}>{domain.statusLabel}</Badge>
      </header>

      <div className="domain-lifecycle-summary">
        <div>
          <strong>Lifecycle status</strong>
          <code>{domain.status}</code>
        </div>
        <p>{domain.statusDescription}</p>
        <small>Last server check: {domain.lastCheckedLabel}</small>
      </div>

      {domain.verificationError ? (
        <p className="domain-verification-error" role="alert">
          Last verification issue: {domain.verificationError}
        </p>
      ) : null}
      {domain.actionError ? (
        <p className="domain-inline-error" role="alert">
          {domain.actionError}
        </p>
      ) : null}
      {domain.actionLabel && domain.onPrimaryAction ? (
        <section className="domain-primary-action">
          <div>
            <strong>
              {domain.status === 'association-incomplete'
                ? 'Ready for release confirmation'
                : 'Run a trusted infrastructure check'}
            </strong>
            <p>
              {domain.status === 'association-incomplete'
                ? 'An organization owner must confirm that released mobile builds contain this hostname.'
                : 'Relay checks the fixed DNS records and asks the configured ingress provider for TLS state.'}
            </p>
          </div>
          <Button
            aria-busy={domain.isActionRunning}
            disabled={domain.isActionRunning}
            onClick={domain.onPrimaryAction}
          >
            {domain.isActionRunning ? 'Working…' : domain.actionLabel}
          </Button>
        </section>
      ) : null}

      {domain.type === 'custom' ? (
        <section aria-labelledby="dns-instructions-title" className="domain-instructions">
          <div className="domain-section-heading">
            <div>
              <h3 id="dns-instructions-title">Publish these exact DNS records</h3>
              <p>Names and values are generated server-side for this workspace hostname.</p>
            </div>
          </div>
          {domain.isLoadingInstructions ? <TableSkeleton rows={3} /> : null}
          {domain.instructionsError ? (
            <p className="domain-inline-error" role="alert">
              {domain.instructionsError}
            </p>
          ) : null}
          {!domain.isLoadingInstructions
            ? domain.instructions.map((record) => (
                <DNSRecordView key={record.type} record={record} />
              ))
            : null}
          <p className="domain-dns-note">
            Use the DNS provider’s default TTL. Relay does not query arbitrary URLs from this
            screen; trusted operator automation records DNS and certificate evidence.
          </p>
        </section>
      ) : (
        <section className="domain-managed-note">
          <strong>Managed by Relay</strong>
          <p>
            The operator provisions DNS and TLS for this hostname. No ownership TXT record is
            required from your team.
          </p>
        </section>
      )}

      <section aria-labelledby="mobile-release-title" className="domain-release-note">
        <h3 id="mobile-release-title">TLS and mobile release gate</h3>
        <p>{domain.releaseGuidance}</p>
        <ul>
          <li>
            iOS entitlement: <code>applinks:{domain.hostname}</code>
          </li>
          <li>
            Android intent filter host: <code>{domain.hostname}</code>
          </li>
          <li>Always test a production-signed build after the domain becomes Active.</li>
        </ul>
      </section>
    </section>
  )
}
