import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { DomainReleaseConfirmationViewModel } from './domains.types'

export function DomainReleaseConfirmationView({
  confirmation,
}: {
  confirmation: DomainReleaseConfirmationViewModel
}) {
  if (!confirmation.isOpen || !confirmation.targetHostname) return null

  return (
    <div
      aria-labelledby="domain-release-confirmation-title"
      aria-modal="true"
      className="modal-backdrop"
      role="dialog"
    >
      <form
        className="modal domain-release-confirmation-modal"
        noValidate
        onSubmit={confirmation.onSubmit}
      >
        <header className="modal-header">
          <div>
            <h2 id="domain-release-confirmation-title">Confirm mobile release support</h2>
            <p className="card-description">
              This final gate enables public links on the custom hostname.
            </p>
          </div>
          <button
            aria-label="Close release confirmation"
            className="icon-button"
            disabled={confirmation.isSaving}
            onClick={confirmation.onClose}
            type="button"
          >
            <Icon name="x" />
          </button>
        </header>
        <div className="modal-body">
          <aside className="domain-release-warning">
            <strong>Verify production builds first</strong>
            <p>
              A released iOS build must include <code>applinks:{confirmation.targetHostname}</code>,
              and the released Android build must include the same host in its intent filter. Test
              both association files and a signed build before continuing.
            </p>
          </aside>
          <label className="form-group" htmlFor="domain-release-hostname">
            <span className="form-label">
              Type <code>{confirmation.targetHostname}</code> *
            </span>
            <input
              autoComplete="off"
              autoFocus
              className="field"
              id="domain-release-hostname"
              onChange={(event) => confirmation.onHostnameChange(event.currentTarget.value)}
              spellCheck={false}
              value={confirmation.hostname}
            />
          </label>
          <label className="auth-checkbox" htmlFor="domain-release-acknowledgement">
            <input
              checked={confirmation.isConfirmed}
              id="domain-release-acknowledgement"
              onChange={(event) => confirmation.onConfirmedChange(event.currentTarget.checked)}
              type="checkbox"
            />
            <span>
              I confirm that released mobile builds support this exact hostname and have been tested
              on real devices.
            </span>
          </label>
          {confirmation.error ? (
            <p className="form-error" role="alert">
              {confirmation.error}
            </p>
          ) : null}
        </div>
        <footer className="modal-footer">
          <Button
            disabled={confirmation.isSaving}
            onClick={confirmation.onClose}
            variant="secondary"
          >
            Cancel
          </Button>
          <Button
            disabled={
              confirmation.isSaving || !confirmation.hostname.trim() || !confirmation.isConfirmed
            }
            type="submit"
          >
            {confirmation.isSaving ? 'Activating…' : 'Activate custom domain'}
          </Button>
        </footer>
      </form>
    </div>
  )
}
