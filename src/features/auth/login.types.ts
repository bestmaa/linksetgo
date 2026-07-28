import type { ChangeEventHandler, FormEventHandler } from 'react'

export type LoginViewProps = {
  email: string
  error: string | null
  isSubmitting: boolean
  onEmailChange: ChangeEventHandler<HTMLInputElement>
  onPasswordChange: ChangeEventHandler<HTMLInputElement>
  onSubmit: FormEventHandler<HTMLFormElement>
  password: string
  recoveryAvailable: boolean
  signupAvailable: boolean
}
