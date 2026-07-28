import type { Metadata } from 'next'

import { ResendVerificationConnector } from '@/features/account-recovery/resend-verification.connector'
import { getCloudSignupConfiguration } from '@/lib/server/cloud-signup-config'

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: 'Resend verification',
}

export const dynamic = 'force-dynamic'

export default function ResendVerificationPage() {
  return (
    <ResendVerificationConnector available={getCloudSignupConfiguration().status === 'ready'} />
  )
}
