import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { DomainsViewProps } from './domains.types'

type RegistrationProps = Pick<
  DomainsViewProps,
  | 'hostname'
  | 'hostnameError'
  | 'isSaving'
  | 'onCloseCreate'
  | 'onHostnameBlur'
  | 'onHostnameChange'
  | 'onSubmit'
  | 'submitError'
  | 'workspaceName'
>

export function DomainRegistrationView(props: RegistrationProps) {
  return (
    <div
      aria-labelledby="domain-registration-title"
      aria-modal="true"
      className="modal-backdrop"
      role="dialog"
    >
      <form className="modal domain-registration-modal" noValidate onSubmit={props.onSubmit}>
        <header className="modal-header">
          <div>
            <h2 id="domain-registration-title">Register custom domain</h2>
            <p className="card-description">Connect one hostname to {props.workspaceName}.</p>
          </div>
          <button
            aria-label="Close custom domain form"
            className="icon-button"
            onClick={props.onCloseCreate}
            type="button"
          >
            <Icon name="x" />
          </button>
        </header>
        <div className="modal-body">
          <label className="form-group" htmlFor="custom-domain-hostname">
            <span className="form-label">Public hostname *</span>
            <input
              aria-describedby={
                props.hostnameError
                  ? 'custom-domain-help custom-domain-error'
                  : 'custom-domain-help'
              }
              aria-invalid={Boolean(props.hostnameError)}
              autoFocus
              className="field"
              id="custom-domain-hostname"
              onBlur={props.onHostnameBlur}
              onChange={(event) => props.onHostnameChange(event.currentTarget.value)}
              placeholder="links.company.com"
              value={props.hostname}
            />
            <span className="form-help" id="custom-domain-help">
              Enter a hostname only—no https://, path, port, IP address, or wildcard.
            </span>
            {props.hostnameError ? (
              <span className="form-error" id="custom-domain-error" role="alert">
                {props.hostnameError}
              </span>
            ) : null}
          </label>
          <aside className="domain-entitlement-note">
            <strong>Server policy is authoritative</strong>
            <p>
              Submitting requests registration from this Relay installation. Any plan or operator
              restriction is enforced by the server; this screen does not assume entitlement.
            </p>
          </aside>
          {props.submitError ? (
            <p className="form-error" role="alert">
              {props.submitError}
            </p>
          ) : null}
        </div>
        <footer className="modal-footer">
          <Button disabled={props.isSaving} onClick={props.onCloseCreate} variant="secondary">
            Cancel
          </Button>
          <Button disabled={props.isSaving || !props.workspaceName} type="submit">
            {props.isSaving ? 'Registering…' : 'Register domain'}
          </Button>
        </footer>
      </form>
    </div>
  )
}
