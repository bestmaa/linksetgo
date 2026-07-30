import type { ChangeEventHandler, FormEventHandler } from 'react'

export type SignupSubmissionState =
  | { status: 'error'; message: string; field?: SignupField }
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success' }

export type SignupField =
  'acceptTerms' | 'email' | 'form' | 'name' | 'organizationName' | 'password' | 'workspaceSlug'

export type SignupViewProps = {
  acceptTerms: boolean
  available: boolean
  email: string
  name: string
  onAcceptTermsChange: ChangeEventHandler<HTMLInputElement>
  onEmailChange: ChangeEventHandler<HTMLInputElement>
  onNameChange: ChangeEventHandler<HTMLInputElement>
  onPasswordChange: ChangeEventHandler<HTMLInputElement>
  onShowPasswordChange: ChangeEventHandler<HTMLInputElement>
  onSubmit: FormEventHandler<HTMLFormElement>
  password: string
  showPassword: boolean
  state: SignupSubmissionState
}

export type SignupConnectorProps = {
  available: boolean
}
