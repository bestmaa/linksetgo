import { Button } from '@/components/ui/button'

import type { AppDetailAction, AppDetailViewProps } from './app-detail.types'

const copy: Record<AppDetailAction, { body: string; confirm: string; title: string }> = {
  activate: {
    body: 'This app will become eligible for public links and its completed platform identity will be published in association records.',
    confirm: 'Activate app',
    title: 'Activate this app?',
  },
  pause: {
    body: 'Public links connected to this app will stop resolving. Configuration and link records will be kept so the app can be activated again.',
    confirm: 'Pause app',
    title: 'Pause this app?',
  },
}

type AppDetailConfirmViewProps = Pick<
  AppDetailViewProps,
  'isSaving' | 'mutationError' | 'onCancelAction' | 'onConfirmAction'
> & {
  action: AppDetailAction
}

export function AppDetailConfirmView(props: AppDetailConfirmViewProps) {
  const content = copy[props.action]
  return (
    <div className="modal-backdrop">
      <section
        aria-describedby="app-detail-confirm-description"
        aria-labelledby="app-detail-confirm-title"
        aria-modal="true"
        className="modal app-detail-confirm-modal"
        role="alertdialog"
      >
        <header className="modal-header">
          <h2 id="app-detail-confirm-title">{content.title}</h2>
        </header>
        <div className="modal-body">
          <p id="app-detail-confirm-description">{content.body}</p>
          {props.mutationError ? (
            <p className="app-detail-inline-error" role="alert">
              {props.mutationError}
            </p>
          ) : null}
        </div>
        <footer className="modal-footer">
          <Button disabled={props.isSaving} onClick={props.onCancelAction} variant="quiet">
            Cancel
          </Button>
          <Button
            autoFocus
            disabled={props.isSaving}
            onClick={props.onConfirmAction}
            variant={props.action === 'pause' ? 'danger' : 'primary'}
          >
            {props.isSaving ? 'Working…' : content.confirm}
          </Button>
        </footer>
      </section>
    </div>
  )
}
