import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import type { AppDetailViewModel } from './app-detail.types'

export function AppDetailLinksView({
  app,
  isRuntimeDomainLoading,
  onCreateLink,
  onRetryRuntimeDomain,
  runtimeDomainError,
}: {
  app: AppDetailViewModel
  isRuntimeDomainLoading: boolean
  onCreateLink: () => void
  onRetryRuntimeDomain: () => void
  runtimeDomainError: string | null
}) {
  return (
    <section className="card app-detail-links-card">
      <header className="card-header">
        <div>
          <h2 className="card-title">Connected links</h2>
          <p className="card-description">{app.linkCountLabel}</p>
        </div>
        <Link className="button button-quiet" href={app.linksHref}>
          View all →
        </Link>
      </header>
      {runtimeDomainError ? (
        <div className="app-detail-domain-error" role="alert">
          <span>{runtimeDomainError}</span>
          <Button onClick={onRetryRuntimeDomain} variant="quiet">
            Retry domain
          </Button>
        </div>
      ) : null}
      {app.recentLinks.length === 0 ? (
        <div className="app-detail-links-empty">
          <p>No links use this app yet.</p>
          <Button onClick={onCreateLink} variant="secondary">
            Create first link
          </Button>
        </div>
      ) : (
        <div className="app-detail-link-list">
          {app.recentLinks.map((link) => (
            <article key={link.id}>
              <div>
                <strong>{link.name}</strong>
                <span>{link.destination}</span>
              </div>
              <code>
                {link.publicUrl ??
                  (isRuntimeDomainLoading
                    ? 'Loading workspace domain…'
                    : 'Workspace domain unavailable')}
              </code>
              <Badge tone={link.statusTone}>{link.status}</Badge>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
