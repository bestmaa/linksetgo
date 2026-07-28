import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { LinkDetailViewProps } from './link-detail.types'

type EditProps = Pick<
  LinkDetailViewProps,
  | 'form'
  | 'formErrors'
  | 'isSaving'
  | 'mutationError'
  | 'onAddParameter'
  | 'onCloseEdit'
  | 'onFieldChange'
  | 'onSubmit'
>

export function LinkDetailEditView(props: EditProps) {
  return (
    <div className="modal-backdrop">
      <section
        aria-labelledby="link-edit-title"
        aria-modal="true"
        className="modal link-detail-edit-modal"
        role="dialog"
      >
        <form noValidate onSubmit={props.onSubmit}>
          <header className="modal-header">
            <div>
              <h2 id="link-edit-title">Edit link configuration</h2>
              <p>App ownership and the public link key remain permanent.</p>
            </div>
            <button
              aria-label="Close link editor"
              className="icon-button"
              disabled={props.isSaving}
              onClick={props.onCloseEdit}
              type="button"
            >
              <Icon name="x" />
            </button>
          </header>
          <div className="modal-body form-grid">
            <label className="form-group form-span">
              <span className="form-label">Link name</span>
              <input
                aria-invalid={Boolean(props.formErrors.name)}
                className="field"
                maxLength={160}
                onChange={(event) => props.onFieldChange('name', event.target.value)}
                value={props.form.name}
              />
              {props.formErrors.name ? (
                <span className="form-error">{props.formErrors.name}</span>
              ) : null}
            </label>
            <label className="form-group form-span">
              <span className="form-label">Destination path</span>
              <input
                aria-invalid={Boolean(props.formErrors.destinationPath)}
                className="field"
                maxLength={2048}
                onChange={(event) => props.onFieldChange('destinationPath', event.target.value)}
                placeholder="/rewards-detail"
                value={props.form.destinationPath}
              />
              {props.formErrors.destinationPath ? (
                <span className="form-error">{props.formErrors.destinationPath}</span>
              ) : null}
            </label>
            <div className="form-group form-span">
              <div className="field-row" style={{ justifyContent: 'space-between' }}>
                <span className="form-label">Scalar parameters</span>
                <Button
                  disabled={props.form.parameters.length >= 20}
                  onClick={props.onAddParameter}
                  variant="quiet"
                >
                  <Icon name="plus" /> Add parameter
                </Button>
              </div>
              {props.form.parameters.map((parameter) => (
                <div className="parameter-row" key={parameter.id}>
                  <input
                    aria-label="Parameter key"
                    className="field"
                    maxLength={64}
                    onChange={parameter.onKeyChange}
                    value={parameter.key}
                  />
                  <input
                    aria-label="Parameter value"
                    className="field"
                    maxLength={512}
                    onChange={parameter.onValueChange}
                    value={parameter.value}
                  />
                  <button
                    aria-label="Remove parameter"
                    className="icon-button"
                    onClick={parameter.onRemove}
                    type="button"
                  >
                    <Icon name="x" />
                  </button>
                </div>
              ))}
              {props.formErrors.parameters ? (
                <span className="form-error">{props.formErrors.parameters}</span>
              ) : null}
            </div>
            <label className="form-group form-span">
              <span className="form-label">Web fallback override</span>
              <input
                aria-invalid={Boolean(props.formErrors.fallbackUrl)}
                className="field"
                onChange={(event) => props.onFieldChange('fallbackUrl', event.target.value)}
                placeholder="Uses the app default when blank"
                type="url"
                value={props.form.fallbackUrl}
              />
              {props.formErrors.fallbackUrl ? (
                <span className="form-error">{props.formErrors.fallbackUrl}</span>
              ) : null}
            </label>
            <label className="form-group">
              <span className="form-label">Expires on</span>
              <input
                aria-invalid={Boolean(props.formErrors.expiresAt)}
                className="field"
                onChange={(event) => props.onFieldChange('expiresAt', event.target.value)}
                type="date"
                value={props.form.expiresAt}
              />
              {props.formErrors.expiresAt ? (
                <span className="form-error">{props.formErrors.expiresAt}</span>
              ) : null}
            </label>
            {props.mutationError ? (
              <p className="form-error form-span" role="alert">
                {props.mutationError}
              </p>
            ) : null}
          </div>
          <footer className="modal-footer">
            <Button disabled={props.isSaving} onClick={props.onCloseEdit} variant="quiet">
              Cancel
            </Button>
            <Button disabled={props.isSaving} type="submit">
              {props.isSaving ? 'Saving…' : 'Save changes'}
            </Button>
          </footer>
        </form>
      </section>
    </div>
  )
}
