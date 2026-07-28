'use client'

import { AccountEmailActionView } from './account-email-action.view'
import { useResendVerificationController } from './use-account-email-action'

export function ResendVerificationConnector(props: { available: boolean }) {
  return (
    <AccountEmailActionView
      {...useResendVerificationController(props.available)}
      asideLabel="LinksetGo Cloud email verification"
      asideMessage="A fresh one-time link replaces the previous link for the pending account."
      asideTitle="Confirm ownership. Activate safely."
      description="Enter the email used at signup. For privacy, the response is the same for every address."
      submitLabel="Send verification link"
      submittingLabel="Sending…"
      successMessage="If a pending account matches that email, a new verification link is on its way."
      successTitle="Check your email"
      symbol="✉"
      title="Resend verification"
    />
  )
}
