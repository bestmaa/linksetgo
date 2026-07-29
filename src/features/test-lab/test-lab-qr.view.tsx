import Image from 'next/image'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

type TestLabQrViewProps = {
  onCopy: () => void
  onDownloadPng: () => void
  onDownloadSvg: () => void
  openUrl: string | null
  qrDataUrl: string | null
  qrError: string | null
}

export function TestLabQrView(props: TestLabQrViewProps) {
  return (
    <aside className="card phone-panel">
      <p className="eyebrow">Device handoff</p>
      <h2 className="card-title">Scan on a real device</h2>
      <div className="phone">
        <div className="phone-screen">
          <div className="phone-notch" />
          {props.qrDataUrl ? (
            <Image
              alt="QR code for the current deep link"
              className="qr-image"
              height={154}
              src={props.qrDataUrl}
              unoptimized
              width={154}
            />
          ) : (
            <span className="empty-symbol" aria-hidden="true">
              QR
            </span>
          )}
          <strong>Open with LinksetGo</strong>
          <span className="status-detail test-qr-caption">
            {props.qrError ?? 'Scan to test this URL'}
          </span>
        </div>
      </div>
      <div className="test-device-actions">
        <Button onClick={props.onCopy} variant="secondary">
          <Icon name="copy" /> Copy URL
        </Button>
        {props.openUrl ? (
          <a
            className="button button-primary"
            href={props.openUrl}
            rel="noreferrer"
            target="_blank"
          >
            Open <Icon name="external" size={15} />
          </a>
        ) : (
          <span aria-disabled="true" className="button button-primary test-disabled-link">
            Open <Icon name="external" size={15} />
          </span>
        )}
      </div>
      <div aria-label="Download QR code" className="test-qr-downloads" role="group">
        <Button disabled={!props.qrDataUrl} onClick={props.onDownloadPng} variant="quiet">
          Download PNG
        </Button>
        <Button disabled={!props.qrDataUrl} onClick={props.onDownloadSvg} variant="quiet">
          Download SVG
        </Button>
      </div>
      <p className="test-caveat">
        LinksetGo validates the web and association configuration. It cannot prove that the
        installed app opened the intended native screen; confirm that final step on a physical
        device.
      </p>
    </aside>
  )
}
