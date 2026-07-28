type SharedFieldProps = {
  autoFocus?: boolean
  error?: string | undefined
  help?: string | undefined
  id: string
  label: string
  maxLength?: number
  onBlur: () => void
  onChange: (value: string) => void
  placeholder?: string
  required?: boolean
  spellCheck?: boolean
  value: string
}

type TextFieldProps = SharedFieldProps & {
  inputMode?: 'text' | 'url'
  type?: 'text' | 'url'
}

function describedBy(id: string, help?: string, error?: string): string | undefined {
  const values = [help ? `${id}-help` : '', error ? `${id}-error` : ''].filter(Boolean)
  return values.length > 0 ? values.join(' ') : undefined
}

export function OnboardingTextField(props: TextFieldProps) {
  return (
    <div className="onboarding-field">
      <label className="form-label" htmlFor={props.id}>
        {props.label}
        {props.required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <input
        aria-describedby={describedBy(props.id, props.help, props.error)}
        aria-invalid={Boolean(props.error)}
        autoFocus={props.autoFocus}
        className="field"
        id={props.id}
        inputMode={props.inputMode}
        maxLength={props.maxLength}
        onBlur={props.onBlur}
        onChange={(event) => props.onChange(event.currentTarget.value)}
        placeholder={props.placeholder}
        spellCheck={props.spellCheck}
        type={props.type ?? 'text'}
        value={props.value}
      />
      {props.help ? (
        <p className="form-help" id={`${props.id}-help`}>
          {props.help}
        </p>
      ) : null}
      {props.error ? (
        <p className="form-error" id={`${props.id}-error`} role="alert">
          {props.error}
        </p>
      ) : null}
    </div>
  )
}

export function OnboardingTextArea(
  props: SharedFieldProps & { rows?: number; spellCheck?: boolean },
) {
  return (
    <div className="onboarding-field">
      <label className="form-label" htmlFor={props.id}>
        {props.label}
        {props.required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <textarea
        aria-describedby={describedBy(props.id, props.help, props.error)}
        aria-invalid={Boolean(props.error)}
        className="field textarea"
        id={props.id}
        maxLength={props.maxLength}
        onBlur={props.onBlur}
        onChange={(event) => props.onChange(event.currentTarget.value)}
        placeholder={props.placeholder}
        rows={props.rows}
        spellCheck={props.spellCheck}
        value={props.value}
      />
      {props.help ? (
        <p className="form-help" id={`${props.id}-help`}>
          {props.help}
        </p>
      ) : null}
      {props.error ? (
        <p className="form-error" id={`${props.id}-error`} role="alert">
          {props.error}
        </p>
      ) : null}
    </div>
  )
}
