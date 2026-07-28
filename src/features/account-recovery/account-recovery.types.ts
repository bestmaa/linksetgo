import type { ChangeEventHandler, FormEventHandler } from 'react'

export type AccountEmailActionState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success' }
  | { status: 'error'; message: string }

export type AccountEmailActionViewProps = {
  available: boolean
  email: string
  onEmailChange: ChangeEventHandler<HTMLInputElement>
  onSubmit: FormEventHandler<HTMLFormElement>
  state: AccountEmailActionState
}

export type ResetPasswordState =
  | { status: 'checking' }
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success' }
  | { status: 'invalid'; message: string }
  | { status: 'error'; message: string }

export type ResetPasswordViewProps = {
  available: boolean
  confirmPassword: string
  onConfirmPasswordChange: ChangeEventHandler<HTMLInputElement>
  onPasswordChange: ChangeEventHandler<HTMLInputElement>
  onShowPasswordChange: ChangeEventHandler<HTMLInputElement>
  onSubmit: FormEventHandler<HTMLFormElement>
  password: string
  showPassword: boolean
  state: ResetPasswordState
}
