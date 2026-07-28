import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { LinksViewProps } from './links.types'

type LinkFormProps = Pick<
  LinksViewProps,
  | 'appOptions'
  | 'appStatus'
  | 'fallbackHostHelp'
  | 'form'
  | 'formError'
  | 'isSaving'
  | 'nativeImportFeedback'
  | 'nativeScheme'
  | 'nativeUrl'
  | 'onAddParameter'
  | 'onAppChange'
  | 'onCloseCreate'
  | 'onDestinationChange'
  | 'onExpiresChange'
  | 'onFallbackChange'
  | 'onNameChange'
  | 'onNativeUrlChange'
  | 'onNativeUrlImport'
  | 'onSlugChange'
  | 'onStatusChange'
  | 'onSubmit'
>

export function LinkFormView(props: LinkFormProps) {
  return (
    <div aria-modal="true" className="modal-backdrop" role="dialog">
      <form className="modal" onSubmit={props.onSubmit}>
        <header className="modal-header">
          <div>
            <h2>Create deep link</h2>
            <p className="card-description">Route users to a precise screen inside your app.</p>
          </div>
          <button
            aria-label="Close"
            className="icon-button"
            onClick={props.onCloseCreate}
            type="button"
          >
            <Icon name="x" />
          </button>
        </header>
        <div className="modal-body form-grid">
          <div className="native-link-import form-group form-span">
            <div>
              <label className="form-label" htmlFor="native-url">
                React Native URL <span className="optional-label">Optional</span>
              </label>
              <p className="form-help">
                Paste the custom-scheme URL your mobile team supplied. LinksetGo will split its
                route and query values into the fields below.
                {props.nativeScheme
                  ? ` The selected app accepts ${props.nativeScheme}:// URLs.`
                  : ' Configure a native scheme on the selected app first.'}
              </p>
            </div>
            <div className="native-link-import-row">
              <input
                className="field"
                id="native-url"
                onChange={props.onNativeUrlChange}
                placeholder="oberoi://rewards-detail?SlabName=Gold"
                spellCheck={false}
                value={props.nativeUrl}
              />
              <Button
                disabled={!props.nativeUrl.trim() || !props.nativeScheme}
                onClick={props.onNativeUrlImport}
                variant="secondary"
              >
                Import route
              </Button>
            </div>
            {props.nativeImportFeedback ? (
              <p
                className={`native-import-feedback native-import-feedback-${props.nativeImportFeedback.kind}`}
                role={props.nativeImportFeedback.kind === 'error' ? 'alert' : 'status'}
              >
                {props.nativeImportFeedback.message}
              </p>
            ) : null}
          </div>
          <label className="form-group">
            <span className="form-label">Link name</span>
            <input
              autoFocus
              className="field"
              onChange={props.onNameChange}
              placeholder="Summer sale"
              value={props.form.name}
            />
          </label>
          <label className="form-group">
            <span className="form-label">App</span>
            <select className="field" onChange={props.onAppChange} value={props.form.appId}>
              <option value="">Select an app</option>
              {props.appOptions.map((app) => (
                <option key={app.id} value={app.id}>
                  {app.label}
                </option>
              ))}
            </select>
          </label>
          <label className="form-group">
            <span className="form-label">Destination path</span>
            <input
              className="field"
              onChange={props.onDestinationChange}
              placeholder="/offers/summer"
              value={props.form.destinationPath}
            />
            <span className="form-help">
              Enter only the app route, such as /rewards-detail—not the full oberoi:// URL.
            </span>
          </label>
          <label className="form-group">
            <span className="form-label">URL slug</span>
            <input
              className="field"
              onChange={props.onSlugChange}
              placeholder="summer-sale"
              value={props.form.slug}
            />
          </label>
          <div className="form-group form-span">
            <span className="form-label">Generated public URL</span>
            <div className="url-preview">{props.form.publicUrl}</div>
          </div>
          <div className="form-group form-span">
            <div className="field-row" style={{ justifyContent: 'space-between' }}>
              <span className="form-label">Parameters</span>
              <Button onClick={props.onAddParameter} variant="quiet">
                <Icon name="plus" size={14} /> Add parameter
              </Button>
            </div>
            {props.form.parameters.map((parameter) => (
              <div className="parameter-row" key={parameter.id}>
                <input
                  aria-label="Parameter key"
                  className="field"
                  onChange={parameter.onKeyChange}
                  placeholder="productId"
                  value={parameter.key}
                />
                <input
                  aria-label="Parameter value"
                  className="field"
                  onChange={parameter.onValueChange}
                  placeholder="123"
                  value={parameter.value}
                />
                <button
                  aria-label="Remove parameter"
                  className="icon-button"
                  onClick={parameter.onRemove}
                  type="button"
                >
                  <Icon name="x" size={15} />
                </button>
              </div>
            ))}
            {props.form.parameters.length === 0 ? (
              <span className="form-help">
                Query values such as SlabName=Gold are delivered with the destination path.
              </span>
            ) : null}
          </div>
          <label className="form-group form-span">
            <span className="form-label">Web fallback</span>
            <input
              className="field"
              onChange={props.onFallbackChange}
              placeholder="Uses the app default when left blank"
              type="url"
              value={props.form.fallbackUrl}
            />
            <span className="form-help">{props.fallbackHostHelp}</span>
          </label>
          <label className="form-group">
            <span className="form-label">Status</span>
            <select className="field" onChange={props.onStatusChange} value={props.form.status}>
              <option disabled={props.appStatus !== 'active'} value="active">
                Active
              </option>
              <option value="draft">Draft</option>
            </select>
            {props.appStatus !== 'active' ? (
              <span className="form-help">
                This app is {props.appStatus ?? 'not selected'}, so the new link will stay Draft
                until the app is activated.
              </span>
            ) : null}
          </label>
          <label className="form-group">
            <span className="form-label">Expires on</span>
            <input
              className="field"
              onChange={props.onExpiresChange}
              type="date"
              value={props.form.expiresAt}
            />
          </label>
          {props.formError ? (
            <p className="form-error form-span" role="alert">
              {props.formError}
            </p>
          ) : null}
        </div>
        <footer className="modal-footer">
          <Button onClick={props.onCloseCreate} variant="secondary">
            Cancel
          </Button>
          <Button disabled={props.isSaving || props.appOptions.length === 0} type="submit">
            {props.isSaving ? 'Creating…' : 'Create link'}
          </Button>
        </footer>
      </form>
    </div>
  )
}
