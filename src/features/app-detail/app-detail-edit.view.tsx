import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import { AppDetailEditField } from './app-detail-edit-field.view'
import type {
  AppDetailField,
  AppDetailForm,
  AppDetailFormErrors,
  AppDetailViewModel,
  AppDetailViewProps,
} from './app-detail.types'

type AppDetailEditViewProps = Pick<
  AppDetailViewProps,
  | 'form'
  | 'formErrors'
  | 'isSaving'
  | 'mutationError'
  | 'onCloseEdit'
  | 'onFieldChange'
  | 'onSubmit'
> & {
  app: AppDetailViewModel
}

type FieldDefinition = {
  field: AppDetailField
  help?: string
  label: string
  maxLength: number
  multiline?: boolean
  required?: boolean
  type?: 'text' | 'url'
}

function fieldChange(
  field: AppDetailField,
  onFieldChange: AppDetailEditViewProps['onFieldChange'],
) {
  return (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onFieldChange(field, event.target.value)
}

function Field({
  definition,
  errors,
  form,
  onFieldChange,
}: {
  definition: FieldDefinition
  errors: AppDetailFormErrors
  form: AppDetailForm
  onFieldChange: AppDetailEditViewProps['onFieldChange']
}) {
  return (
    <AppDetailEditField
      error={errors[definition.field]}
      help={definition.help}
      id={`app-detail-${definition.field}`}
      label={definition.label}
      maxLength={definition.maxLength}
      multiline={definition.multiline}
      onChange={fieldChange(definition.field, onFieldChange)}
      required={definition.required}
      type={definition.type}
      value={form[definition.field]}
    />
  )
}

const generalFields: readonly FieldDefinition[] = [
  { field: 'name', label: 'App name', maxLength: 120, required: true },
  {
    field: 'nativeScheme',
    help: 'Custom mobile URL scheme without ://, for example sampleapp. Existing apps can be backfilled.',
    label: 'Native URL scheme',
    maxLength: 64,
  },
  {
    field: 'description',
    label: 'Description',
    maxLength: 500,
    multiline: true,
  },
  {
    field: 'fallbackUrl',
    help: 'Used when the app cannot open. HTTPS is required.',
    label: 'Default web fallback',
    maxLength: 2048,
    required: true,
    type: 'url',
  },
]

const iosFields: readonly FieldDefinition[] = [
  { field: 'iosBundleId', label: 'iOS Bundle ID', maxLength: 240 },
  { field: 'iosTeamId', label: 'Apple Team ID', maxLength: 10 },
  {
    field: 'appStoreUrl',
    label: 'App Store URL',
    maxLength: 2048,
    type: 'url',
  },
]

const androidFields: readonly FieldDefinition[] = [
  { field: 'androidPackageName', label: 'Android package', maxLength: 240 },
  {
    field: 'androidSha256CertFingerprints',
    help: 'One colon-separated SHA-256 release certificate per line.',
    label: 'SHA-256 fingerprints',
    maxLength: 1919,
    multiline: true,
  },
  {
    field: 'playStoreUrl',
    label: 'Play Store URL',
    maxLength: 2048,
    type: 'url',
  },
]

function Fields({
  definitions,
  props,
}: {
  definitions: readonly FieldDefinition[]
  props: AppDetailEditViewProps
}) {
  return definitions.map((definition) => (
    <Field
      definition={definition}
      errors={props.formErrors}
      form={props.form}
      key={definition.field}
      onFieldChange={props.onFieldChange}
    />
  ))
}

export function AppDetailEditView(props: AppDetailEditViewProps) {
  return (
    <div className="modal-backdrop">
      <section
        aria-labelledby="app-detail-edit-title"
        aria-modal="true"
        className="modal app-detail-edit-modal"
        role="dialog"
      >
        <form noValidate onSubmit={props.onSubmit}>
          <header className="modal-header">
            <div>
              <h2 id="app-detail-edit-title">Edit app configuration</h2>
              <p>Platform identifiers control association-file readiness.</p>
            </div>
            <button
              aria-label="Close app settings"
              className="icon-button"
              disabled={props.isSaving}
              onClick={props.onCloseEdit}
              type="button"
            >
              <Icon name="x" />
            </button>
          </header>
          <div className="modal-body app-detail-edit-body">
            <section className="app-detail-immutable">
              <div>
                <span>App key</span>
                <code>{props.app.appKey}</code>
              </div>
              <div>
                <span>Workspace</span>
                <strong>{props.app.workspaceName}</strong>
              </div>
              <Badge tone="neutral">Permanent</Badge>
            </section>

            <fieldset className="app-detail-edit-section">
              <legend>General</legend>
              <div className="app-detail-edit-grid">
                <Fields definitions={generalFields} props={props} />
              </div>
            </fieldset>
            <fieldset className="app-detail-edit-section">
              <legend>iOS Universal Links</legend>
              <div className="app-detail-edit-grid">
                <Fields definitions={iosFields} props={props} />
              </div>
            </fieldset>
            <fieldset className="app-detail-edit-section">
              <legend>Android App Links</legend>
              <div className="app-detail-edit-grid">
                <Fields definitions={androidFields} props={props} />
              </div>
            </fieldset>
            {props.mutationError ? (
              <p className="app-detail-inline-error" role="alert">
                {props.mutationError}
              </p>
            ) : null}
          </div>
          <footer className="modal-footer">
            <Button disabled={props.isSaving} onClick={props.onCloseEdit} variant="quiet">
              Cancel
            </Button>
            <Button disabled={props.isSaving} type="submit">
              {props.isSaving ? 'Saving…' : 'Save configuration'}
            </Button>
          </footer>
        </form>
      </section>
    </div>
  )
}
