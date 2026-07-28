import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import { TestLabChecksView } from './test-lab-checks.view'
import { TestLabQrView } from './test-lab-qr.view'
import type { TestLabViewProps } from './test-lab.types'

export function TestLabView(props: TestLabViewProps) {
  return (
    <main className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Configuration validator</p>
          <h1 className="page-title">Test Lab</h1>
          <p className="page-copy">
            Validate a saved link on iOS and Android, then hand it off to a physical device.
          </p>
        </div>
      </header>
      <section className="test-grid">
        <div className="card">
          <form className="test-entry" onSubmit={props.onRun}>
            <div className="test-input-grid">
              <label className="form-group">
                <span className="form-label">Saved link</span>
                <select
                  className="field"
                  disabled={props.isSavedLinksLoading}
                  onChange={props.onSavedLinkChange}
                  value={props.savedLinkId}
                >
                  <option value="">
                    {props.isSavedLinksLoading ? 'Loading saved links...' : 'Paste a URL manually'}
                  </option>
                  {props.savedLinkOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <span className="form-help">
                  Choose a recent saved link or paste any LinksetGo URL.
                </span>
              </label>
              <label className="form-group">
                <span className="form-label">Public deep-link URL</span>
                <input
                  className="field"
                  onChange={props.onUrlChange}
                  placeholder="https://links.example.com/l/app/link"
                  required
                  type="url"
                  value={props.url}
                />
                <span className="form-help">
                  Query parameters and fragments do not belong in the public URL.
                </span>
              </label>
            </div>
            {props.savedLinksError ? (
              <p className="form-error" role="alert">
                Saved links could not load: {props.savedLinksError}
              </p>
            ) : null}
            <div className="test-run-row">
              <div
                aria-label="Platforms to validate"
                className="segmented test-segmented"
                role="group"
              >
                <button
                  aria-pressed={props.platform === 'both'}
                  className={`segment ${props.platform === 'both' ? 'segment-active' : ''}`}
                  onClick={props.onPlatformBoth}
                  type="button"
                >
                  Both
                </button>
                <button
                  aria-pressed={props.platform === 'ios'}
                  className={`segment ${props.platform === 'ios' ? 'segment-active' : ''}`}
                  onClick={props.onPlatformIos}
                  type="button"
                >
                  iOS
                </button>
                <button
                  aria-pressed={props.platform === 'android'}
                  className={`segment ${props.platform === 'android' ? 'segment-active' : ''}`}
                  onClick={props.onPlatformAndroid}
                  type="button"
                >
                  Android
                </button>
              </div>
              <Button disabled={props.isRunning} type="submit">
                <Icon name="test" />
                {props.isRunning ? 'Running checks...' : props.runLabel}
              </Button>
            </div>
          </form>
          <TestLabChecksView
            checks={props.checks}
            copyFeedback={props.copyFeedback}
            summary={props.summary}
            summaryDetail={props.summaryDetail}
          />
        </div>
        <TestLabQrView
          onCopy={props.onCopy}
          onDownloadPng={props.onDownloadPng}
          onDownloadSvg={props.onDownloadSvg}
          openUrl={props.openUrl}
          qrDataUrl={props.qrDataUrl}
          qrError={props.qrError}
        />
      </section>
    </main>
  )
}
