import { Button } from '@/components/ui/button'

import type { LinkDetailAction, LinkDetailViewProps } from './link-detail.types'

type ConfirmProps = Pick<
  LinkDetailViewProps,
  'isSaving' | 'mutationError' | 'onActionCancel' | 'onActionConfirm'
> & { action: LinkDetailAction }

export function LinkDetailConfirmView(props: ConfirmProps) {
  const activating = props.action === 'activate'
  return (
    <div className="modal-backdrop">
      <section
        aria-labelledby="link-action-title"
        aria-modal="true"
        className="modal app-detail-confirm-modal"
        role="dialog"
      >
        <header className="modal-header">
          <h2 id="link-action-title">{activating ? 'Activate link?' : 'Pause link?'}</h2>
        </header>
        <div className="modal-body">
          <p>
            {activating
              ? 'The public URL will resolve immediately. The app must be active and your plan must have capacity.'
              : 'The public URL will stop resolving until this link is activated again.'}
          </p>
          {props.mutationError ? (
            <p className="form-error" role="alert">
              {props.mutationError}
            </p>
          ) : null}
        </div>
        <footer className="modal-footer">
          <Button disabled={props.isSaving} onClick={props.onActionCancel} variant="quiet">
            Cancel
          </Button>
          <Button
            disabled={props.isSaving}
            onClick={props.onActionConfirm}
            variant={activating ? 'primary' : 'danger'}
          >
            {props.isSaving ? 'Saving…' : activating ? 'Activate' : 'Pause'}
          </Button>
        </footer>
      </section>
    </div>
  )
}
