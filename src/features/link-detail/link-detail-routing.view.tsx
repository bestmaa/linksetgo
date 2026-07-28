import Image from 'next/image'
import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { LinkDetailViewModel, LinkDetailViewProps } from './link-detail.types'

type RoutingProps = Pick<LinkDetailViewProps, 'onCopyPublicURL' | 'onDownloadQR'> & {
  detail: LinkDetailViewModel
}

export function LinkDetailRoutingView(props: RoutingProps) {
  return (
    <section className="link-detail-routing-grid">
      <article className="card link-detail-route-card">
        <header className="card-header">
          <div>
            <h2 className="card-title">Public campaign URL</h2>
            <p className="card-description">Share this HTTPS URL—not the native scheme.</p>
          </div>
          <Badge tone="blue">HTTPS</Badge>
        </header>
        <div className="card-body">
          {props.detail.publicURL ? (
            <>
              <code className="link-detail-public-url">{props.detail.publicURL}</code>
              <div className="field-row link-detail-actions">
                <Button onClick={props.onCopyPublicURL} variant="secondary">
                  <Icon name="copy" /> Copy URL
                </Button>
                {props.detail.testHref ? (
                  <Link className="button button-primary" href={props.detail.testHref}>
                    <Icon name="test" /> Open Test Lab
                  </Link>
                ) : null}
              </div>
            </>
          ) : (
            <p className="form-error">The workspace link domain is not ready.</p>
          )}
          <dl className="app-detail-definition-list link-detail-identities">
            <div>
              <dt>App</dt>
              <dd>{props.detail.appName}</dd>
            </div>
            <div>
              <dt>Link key</dt>
              <dd>
                <code>{props.detail.linkKey}</code>
              </dd>
            </div>
            <div>
              <dt>Native route preview</dt>
              <dd>
                {props.detail.nativeURL ? (
                  <code>{props.detail.nativeURL}</code>
                ) : (
                  'Backfill the app native scheme'
                )}
              </dd>
            </div>
          </dl>
        </div>
      </article>

      <article className="card link-detail-qr-card">
        <header className="card-header">
          <div>
            <h2 className="card-title">Device QR</h2>
            <p className="card-description">Opens the same public HTTPS URL.</p>
          </div>
        </header>
        <div className="card-body">
          {props.detail.qrDataURL ? (
            <Image
              alt="QR code for this public deep link"
              height={190}
              src={props.detail.qrDataURL}
              unoptimized
              width={190}
            />
          ) : (
            <div className="link-detail-qr-placeholder">Generating QR…</div>
          )}
          {props.detail.qrError ? <p className="form-error">{props.detail.qrError}</p> : null}
          <Button
            disabled={!props.detail.qrDataURL}
            onClick={props.onDownloadQR}
            variant="secondary"
          >
            Download PNG
          </Button>
        </div>
      </article>
    </section>
  )
}
