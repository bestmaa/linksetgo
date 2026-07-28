'use client'

import { useVerifyEmailController } from './use-verify-email-controller'
import { VerifyEmailView } from './verify-email.view'

export function VerifyEmailConnector() {
  return <VerifyEmailView {...useVerifyEmailController()} />
}
