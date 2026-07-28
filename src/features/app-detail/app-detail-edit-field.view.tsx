import type { ChangeEventHandler } from 'react'

type AppDetailEditFieldProps = {
  error: string | undefined
  help: string | undefined
  id: string
  label: string
  maxLength: number
  multiline: boolean | undefined
  onChange: ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement>
  required: boolean | undefined
  type: 'text' | 'url' | undefined
  value: string
}

export function AppDetailEditField(props: AppDetailEditFieldProps) {
  const errorID = `${props.id}-error`
  const helpID = `${props.id}-help`
  const describedBy = [props.help ? helpID : null, props.error ? errorID : null]
    .filter(Boolean)
    .join(' ')
  const shared = {
    'aria-describedby': describedBy || undefined,
    'aria-invalid': Boolean(props.error),
    className: 'field',
    id: props.id,
    maxLength: props.maxLength,
    onChange: props.onChange,
    required: props.required,
    value: props.value,
  }

  return (
    <div className="form-group">
      <label className="form-label" htmlFor={props.id}>
        {props.label}
        {props.required ? ' *' : ''}
      </label>
      {props.multiline ? (
        <textarea {...shared} rows={4} />
      ) : (
        <input {...shared} type={props.type ?? 'text'} />
      )}
      {props.help ? (
        <span className="form-help" id={helpID}>
          {props.help}
        </span>
      ) : null}
      {props.error ? (
        <span className="form-error" id={errorID}>
          {props.error}
        </span>
      ) : null}
    </div>
  )
}
