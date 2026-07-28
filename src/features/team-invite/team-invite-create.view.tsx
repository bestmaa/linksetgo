import { Button } from '@/components/ui/button'

import type { TeamInviteViewProps } from './team-invite.types'

type Props = Pick<
  TeamInviteViewProps,
  | 'confirmPassword'
  | 'error'
  | 'isSubmitting'
  | 'name'
  | 'onConfirmPasswordChange'
  | 'onCreateAccount'
  | 'onNameChange'
  | 'onPasswordChange'
  | 'password'
>

export function TeamInviteCreateView(props: Props) {
  return (
    <form className="auth-form team-invite-create" onSubmit={props.onCreateAccount}>
      <label className="form-group">
        <span className="form-label">Your name</span>
        <input
          autoComplete="name"
          autoFocus
          className="field"
          maxLength={120}
          onChange={props.onNameChange}
          required
          value={props.name}
        />
      </label>
      <label className="form-group">
        <span className="form-label">Create password</span>
        <input
          autoComplete="new-password"
          className="field"
          maxLength={128}
          minLength={12}
          onChange={props.onPasswordChange}
          required
          type="password"
          value={props.password}
        />
        <span className="form-help">
          Use 12–128 characters with upper, lower, number, and symbol.
        </span>
      </label>
      <label className="form-group">
        <span className="form-label">Confirm password</span>
        <input
          autoComplete="new-password"
          className="field"
          maxLength={128}
          minLength={12}
          onChange={props.onConfirmPasswordChange}
          required
          type="password"
          value={props.confirmPassword}
        />
      </label>
      {props.error ? (
        <p className="form-error" role="alert">
          {props.error}
        </p>
      ) : null}
      <Button disabled={props.isSubmitting} type="submit">
        {props.isSubmitting ? 'Joining…' : 'Create account and join'}
      </Button>
    </form>
  )
}
