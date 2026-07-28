export type VerifyEmailState =
  | { status: 'checking' }
  | { status: 'error'; message: string }
  | { status: 'verified'; email: string }

export type VerifyEmailViewProps = {
  state: VerifyEmailState
}
