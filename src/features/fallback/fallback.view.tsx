import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { FallbackViewProps } from './fallback.types'

export function FallbackView(props: FallbackViewProps) {
  return (
    <main className="fallback-page">
      <section aria-live="polite" className="fallback-card">
        <span aria-hidden="true" className="brand-mark" style={{ margin: '0 auto' }}>
          {props.state === 'ready' ? props.appName.charAt(0).toUpperCase() : 'R'}
        </span>
        <h1>
          {props.isLoading
            ? 'Opening your link'
            : props.state === 'ready'
              ? `Continue to ${props.appName}`
              : 'This link is unavailable'}
        </h1>
        <p>{props.message}</p>
        <div className="fallback-actions">
          {props.openAppAction ? (
            <a
              className="button button-primary"
              href={props.openAppAction.href}
              onClick={props.openAppAction.onClick}
            >
              Open in app <Icon name="arrow" />
            </a>
          ) : null}
          {props.storeLinks.map((store) => (
            <a
              className="button button-primary"
              href={store.href}
              key={store.href}
              onClick={store.onClick}
            >
              {store.label} <Icon name="external" />
            </a>
          ))}
          {props.fallbackHref ? (
            <a className="button button-secondary" href={props.fallbackHref}>
              Continue on the web
            </a>
          ) : null}
          <Button onClick={props.onCopy} variant="quiet">
            <Icon name="copy" /> Copy this link
          </Button>
        </div>
        <p className="test-caveat">
          If the app is installed, your phone normally opens it before this page appears.
        </p>
        <p className="fallback-powered">
          Deep-link delivery by Relay · <a href="/open-source">Open source</a> ·{' '}
          <a href={props.reportHref}>Report abuse</a>
        </p>
      </section>
      {props.toast ? (
        <div aria-live="polite" className="toast-region">
          <div className="toast">
            <Icon name="check" />
            {props.toast}
          </div>
        </div>
      ) : null}
    </main>
  )
}
