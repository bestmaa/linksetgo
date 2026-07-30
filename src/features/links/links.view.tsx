import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Icon } from '@/components/ui/icon'
import { ErrorState, TableSkeleton } from '@/components/ui/load-state'
import Link from 'next/link'

import { LinkFormView } from './link-form.view'
import { LinksTableView } from './links-table.view'
import type { LinksViewProps } from './links.types'

export function LinksView(props: LinksViewProps) {
  return (
    <section className="links-catalog">
      <header className="page-header">
        <div>
          <p className="eyebrow">Destinations</p>
          <h1 className="page-title">Links</h1>
          <p className="page-copy">Create, share and inspect every route from one place.</p>
        </div>
        <Button onClick={props.onCreate}>
          <Icon name="plus" /> Advanced link
        </Button>
      </header>
      {props.lastCreatedLink ? (
        <section className="created-link-banner" role="status">
          <div className="created-link-copy">
            <span className="created-link-icon">
              <Icon name="check" size={16} />
            </span>
            <div>
              <strong>{props.lastCreatedLink.name} is live</strong>
              <div className="link-url created-link-url">{props.lastCreatedLink.publicUrl}</div>
            </div>
          </div>
          <div className="created-link-actions">
            <Button onClick={props.lastCreatedLink.onCopy} variant="secondary">
              <Icon name="copy" size={15} /> Copy URL
            </Button>
            <Link className="button button-primary" href={props.lastCreatedLink.testHref}>
              <Icon name="test" size={15} /> Test now
            </Link>
            <button
              aria-label="Dismiss created link"
              className="icon-button"
              onClick={props.lastCreatedLink.onDismiss}
              type="button"
            >
              <Icon name="x" size={15} />
            </button>
          </div>
        </section>
      ) : null}
      <div className="toolbar">
        <input
          aria-label="Search links"
          className="search-field"
          onChange={props.onSearchChange}
          placeholder="Search links, slugs or destinations…"
          value={props.search}
        />
        <select
          aria-label="Filter by app"
          className="field select"
          onChange={props.onAppFilterChange}
          value={props.appFilter}
        >
          <option value="">All apps</option>
          {props.appOptions.map((app) => (
            <option key={app.id} value={app.id}>
              {app.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by status"
          className="field select"
          onChange={props.onStatusFilterChange}
          value={props.statusFilter}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="paused">Paused</option>
          <option value="expired">Expired</option>
        </select>
        <Badge tone="neutral">{props.totalLinks} links</Badge>
      </div>

      <section className="card">
        {props.isLoading ? <TableSkeleton /> : null}
        {props.error ? <ErrorState message={props.error} onRetry={props.onRetry} /> : null}
        {!props.isLoading && !props.error && props.links.length === 0 ? (
          <EmptyState
            actionLabel="Create a deep link"
            description="Choose an app and destination, then LinksetGo will generate a URL you can share."
            onAction={props.onCreate}
            title={
              props.search || props.appFilter || props.statusFilter
                ? 'No matching links'
                : 'No links yet'
            }
          />
        ) : null}
        {!props.isLoading && !props.error && props.links.length > 0 ? (
          <>
            <LinksTableView links={props.links} />
            <footer className="table-pagination">
              <span>
                Page {props.page} of {props.totalPages}
              </span>
              <span className="field-row">
                <Button
                  disabled={props.page <= 1 || props.isLoading}
                  onClick={props.onPreviousPage}
                  variant="quiet"
                >
                  Previous
                </Button>
                <Button
                  disabled={props.page >= props.totalPages || props.isLoading}
                  onClick={props.onNextPage}
                  variant="quiet"
                >
                  Next
                </Button>
              </span>
            </footer>
          </>
        ) : null}
      </section>

      {props.isCreateOpen ? <LinkFormView {...props} /> : null}
      {props.toast ? (
        <div aria-live="polite" className="toast-region">
          <div className="toast">
            <Icon name="check" />
            {props.toast}
          </div>
        </div>
      ) : null}
    </section>
  )
}
