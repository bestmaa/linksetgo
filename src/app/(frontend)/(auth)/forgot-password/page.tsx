import type { Metadata } from 'next'

import { ForgotPasswordConnector } from '@/features/account-recovery/forgot-password.connector'
import { getCloudAccountRecoveryConfiguration } from '@/lib/server/cloud-signup-config'

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: 'Forgot password',
}

export const dynamic = 'force-dynamic'

export default function ForgotPasswordPage() {
  return (
    <ForgotPasswordConnector
      available={getCloudAccountRecoveryConfiguration().status === 'ready'}
    />
  )
}
