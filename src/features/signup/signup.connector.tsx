'use client'

import type { SignupConnectorProps } from './signup.types'
import { SignupView } from './signup.view'
import { useSignupController } from './use-signup-controller'

export function SignupConnector(props: SignupConnectorProps) {
  return <SignupView {...useSignupController(props)} />
}
