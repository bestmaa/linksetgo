import type { Metadata } from 'next'

import { LoginConnector } from '@/features/auth/login.connector'
import {
  getCloudAccountRecoveryConfiguration,
  getCloudSignupConfiguration,
} from '@/lib/server/cloud-signup-config'

export const metadata: Metadata = {
  title: 'Sign in',
}

export const dynamic = 'force-dynamic'

export default function LoginPage() {
  return (
    <LoginConnector
      recoveryAvailable={getCloudAccountRecoveryConfiguration().status === 'ready'}
      signupAvailable={getCloudSignupConfiguration().status === 'ready'}
    />
  )
}
