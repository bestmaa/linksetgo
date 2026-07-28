'use client'

import { Suspense } from 'react'

import { LoginView } from './login.view'
import { useLoginController } from './use-login-controller'

type LoginConnectorProps = {
  recoveryAvailable?: boolean
  signupAvailable?: boolean
}

function LoginContent(props: LoginConnectorProps) {
  return (
    <LoginView
      {...useLoginController()}
      recoveryAvailable={props.recoveryAvailable ?? false}
      signupAvailable={props.signupAvailable ?? false}
    />
  )
}

export function LoginConnector(props: LoginConnectorProps) {
  return (
    <Suspense fallback={null}>
      <LoginContent {...props} />
    </Suspense>
  )
}
