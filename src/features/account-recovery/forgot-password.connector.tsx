'use client'

import { AccountEmailActionView } from './account-email-action.view'
import { useForgotPasswordController } from './use-account-email-action'

export function ForgotPasswordConnector(props: { available: boolean }) {
  return (
    <AccountEmailActionView
      {...useForgotPasswordController(props.available)}
      asideLabel="Relay Cloud account recovery"
      asideMessage="Reset links are short-lived and can be used only once."
      asideTitle="Secure access without support tickets."
      description="Enter your account email. If it matches an active account, we will send a reset link."
      submitLabel="Send reset link"
      submittingLabel="Sending…"
      successMessage="If an active account matches that email, a reset link is on its way."
      successTitle="Check your email"
      symbol="↻"
      title="Reset your password"
    />
  )
}
