import { Button } from '@/components/ui/button'

import type { FallbackOriginRevocationViewModel } from './fallback-origins.types'

export function FallbackOriginRevocationView(props: {
  revocation: FallbackOriginRevocationViewModel
}) {
  const revocation = props.revocation
  if (!revocation.isOpen || !revocation.hostname) return null
  return (
    <div
      aria-labelledby="fallback-revocation-title"
      aria-modal="true"
      className="modal-backdrop"
      role="dialog"
    >
      <section className="modal domain-release-confirmation-modal">
        <header className="modal-header">
          <div>
            <h2 id="fallback-revocation-title">Revoke fallback origin?</h2>
            <p className="card-description">This security action is intentionally permanent.</p>
          </div>
        </header>
        <div className="modal-body">
          <aside className="domain-release-warning">
            <strong>Cloud routing will fail closed</strong>
            <p>
              Apps and links that depend on <code>{revocation.hostname}</code> will no longer
              resolve until their fallback configuration changes. The hostname cannot be re-verified
              through the tenant console after revocation.
            </p>
          </aside>
        </div>
        <footer className="modal-footer">
          <Button disabled={revocation.isSaving} onClick={revocation.onCancel} variant="secondary">
            Keep origin
          </Button>
          <Button disabled={revocation.isSaving} onClick={revocation.onConfirm} variant="danger">
            {revocation.isSaving ? 'Revoking…' : 'Revoke permanently'}
          </Button>
        </footer>
      </section>
    </div>
  )
}
