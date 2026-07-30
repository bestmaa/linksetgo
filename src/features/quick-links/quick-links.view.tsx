import Image from 'next/image'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { QuickLinkViewProps } from './quick-links.types'

export function QuickLinksView(props: QuickLinkViewProps) {
  return (
    <section aria-labelledby="quick-link-title" className="card quick-link-card">
      <div className="quick-link-heading">
        <div>
          <p className="eyebrow">Fast link</p>
          <h1 id="quick-link-title">Paste your mobile URL</h1>
          <p className="card-description">
            LinksetGo creates a live HTTPS link and QR code immediately.
          </p>
        </div>
        <span className="badge badge-success">Free · no domain setup</span>
      </div>

      {props.result ? (
        <div className="quick-link-result" role="status">
          <div className="quick-link-result-copy">
            <span aria-hidden="true" className="created-link-icon">
              <Icon name="check" size={16} />
            </span>
            <div>
              <strong>{props.result.name} is ready</strong>
              <a
                className="link-url"
                href={props.result.publicUrl}
                rel="noreferrer"
                target="_blank"
              >
                {props.result.publicUrl}
              </a>
              <p className="form-help">{props.result.fallbackMessage}</p>
              {props.result.fallbackActionHref ? (
                <a className="text-link" href={props.result.fallbackActionHref}>
                  Verify fallback ownership
                </a>
              ) : null}
            </div>
          </div>
          {props.qrDataUrl ? (
            <Image
              alt={`QR code for ${props.result.publicUrl}`}
              className="quick-link-qr"
              height={144}
              src={props.qrDataUrl}
              unoptimized
              width={144}
            />
          ) : props.qrError ? (
            <p className="form-error">{props.qrError}</p>
          ) : (
            <span className="form-help">Generating QR…</span>
          )}
          <div className="quick-link-result-actions">
            <Button onClick={props.onCopy} variant="secondary">
              <Icon name="copy" size={15} /> Copy link
            </Button>
            {props.qrDataUrl ? (
              <Button onClick={props.onDownloadQr} variant="secondary">
                Download QR
              </Button>
            ) : null}
            <a
              className="button button-primary"
              href={props.result.publicUrl}
              rel="noreferrer"
              target="_blank"
            >
              Open link <Icon name="external" size={15} />
            </a>
            <Button onClick={props.onUseAnother} variant="quiet">
              Create another
            </Button>
          </div>
        </div>
      ) : (
        <form className="quick-link-form" onSubmit={props.onSubmit}>
          <label className="form-group" htmlFor="quick-native-url">
            <span className="form-label">Mobile deep link</span>
            <div className="native-link-import-row">
              <input
                autoFocus
                className="field"
                id="quick-native-url"
                onChange={props.onNativeUrlChange}
                placeholder="oberoi://offer"
                required
                spellCheck={false}
                value={props.nativeUrl}
              />
              <Button
                disabled={!props.workspaceReady || !props.nativeUrl.trim() || props.isSaving}
                type="submit"
              >
                {props.isSaving ? 'Creating…' : 'Create link'}
              </Button>
            </div>
            <span className="form-help">
              Example: oberoi://rewards-detail?SlabName=Gold&amp;SlabPromo=10OFF
            </span>
          </label>

          <Button onClick={props.onAdvancedToggle} variant="quiet">
            {props.advancedOpen ? 'Hide optional settings' : 'Optional fallback and store links'}
          </Button>

          {props.advancedOpen ? (
            <div className="form-grid quick-link-advanced">
              <OptionalField
                label="Link name"
                onChange={props.onNameChange}
                placeholder="Rewards detail"
                value={props.name}
              />
              <OptionalField
                help="It is not exposed until malware scanning and DNS TXT ownership verification pass."
                label="Web fallback"
                onChange={props.onFallbackUrlChange}
                placeholder="https://www.example.com/rewards"
                type="url"
                value={props.fallbackUrl}
              />
              <OptionalField
                help="Android visitors are sent here when the app is not installed and no verified web fallback is available."
                label="Google Play URL"
                onChange={props.onPlayStoreUrlChange}
                placeholder="https://play.google.com/store/apps/details?id=…"
                type="url"
                value={props.playStoreUrl}
              />
              <OptionalField
                help="iPhone and iPad visitors are sent here when the app is not installed and no verified web fallback is available."
                label="App Store URL"
                onChange={props.onAppStoreUrlChange}
                placeholder="https://apps.apple.com/app/…"
                type="url"
                value={props.appStoreUrl}
              />
            </div>
          ) : null}
          {props.error ? (
            <p className="form-error" role="alert">
              {props.error}
            </p>
          ) : null}
          {!props.workspaceReady ? (
            <p className="form-error" role="alert">
              Select a workspace before creating a link.
            </p>
          ) : null}
        </form>
      )}
    </section>
  )
}

type OptionalFieldProps = {
  help?: string
  label: string
  onChange: QuickLinkViewProps['onNameChange']
  placeholder: string
  type?: 'text' | 'url'
  value: string
}

function OptionalField(props: OptionalFieldProps) {
  return (
    <label className="form-group">
      <span className="form-label">
        {props.label} <span className="optional-label">Optional</span>
      </span>
      <input
        className="field"
        onChange={props.onChange}
        placeholder={props.placeholder}
        type={props.type ?? 'text'}
        value={props.value}
      />
      {props.help ? <span className="form-help">{props.help}</span> : null}
    </label>
  )
}
