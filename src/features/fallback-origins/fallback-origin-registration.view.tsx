import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { FallbackOriginRegistrationViewModel } from './fallback-origins.types'

export function FallbackOriginRegistrationView(props: {
  registration: FallbackOriginRegistrationViewModel
  workspaceName: string
}) {
  const registration = props.registration
  if (!registration.isOpen) return null
  return (
    <div
      aria-labelledby="fallback-registration-title"
      aria-modal="true"
      className="modal-backdrop"
      role="dialog"
    >
      <form className="modal domain-registration-modal" noValidate onSubmit={registration.onSubmit}>
        <header className="modal-header">
          <div>
            <h2 id="fallback-registration-title">Register fallback origin</h2>
            <p className="card-description">
              Verify one workspace-owned hostname for {props.workspaceName}.
            </p>
          </div>
          <button
            aria-label="Close fallback origin form"
            className="icon-button"
            onClick={registration.onClose}
            type="button"
          >
            <Icon name="x" />
          </button>
        </header>
        <div className="modal-body">
          <label className="form-group" htmlFor="fallback-origin-hostname">
            <span className="form-label">HTTPS fallback hostname *</span>
            <input
              aria-describedby={
                registration.hostnameError
                  ? 'fallback-origin-help fallback-origin-error'
                  : 'fallback-origin-help'
              }
              aria-invalid={Boolean(registration.hostnameError)}
              autoFocus
              className="field"
              id="fallback-origin-hostname"
              onBlur={registration.onHostnameBlur}
              onChange={(event) => registration.onHostnameChange(event.currentTarget.value)}
              placeholder="www.company.com"
              value={registration.hostname}
            />
            <span className="form-help" id="fallback-origin-help">
              Enter only the hostname from the app&apos;s fallback URL—no https://, path, port, IP,
              or wildcard.
            </span>
            {registration.hostnameError ? (
              <span className="form-error" id="fallback-origin-error" role="alert">
                {registration.hostnameError}
              </span>
            ) : null}
          </label>
          <aside className="domain-entitlement-note">
            <strong>Workspace proof, app-specific policy</strong>
            <p>
              Verification proves this workspace controls the hostname. Each app must still list the
              hostname in its own allowed fallback hosts.
            </p>
          </aside>
          {registration.error ? (
            <p className="form-error" role="alert">
              {registration.error}
            </p>
          ) : null}
        </div>
        <footer className="modal-footer">
          <Button
            disabled={registration.isSaving}
            onClick={registration.onClose}
            variant="secondary"
          >
            Cancel
          </Button>
          <Button disabled={registration.isSaving} type="submit">
            {registration.isSaving ? 'Registering…' : 'Register origin'}
          </Button>
        </footer>
      </form>
    </div>
  )
}
