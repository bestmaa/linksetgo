'use client'

import { ResetPasswordView } from './reset-password.view'
import { useResetPasswordController } from './use-reset-password-controller'

export function ResetPasswordConnector(props: { available: boolean }) {
  return <ResetPasswordView {...useResetPasswordController(props.available)} />
}
