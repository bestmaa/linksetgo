import type { Metadata } from 'next'

import { SignupConnector } from '@/features/signup/signup.connector'
import { getCloudSignupConfiguration } from '@/lib/server/cloud-signup-config'

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: 'Create a workspace',
}

export const dynamic = 'force-dynamic'

export default function SignupPage() {
  const configuration = getCloudSignupConfiguration()
  return (
    <SignupConnector
      available={configuration.status === 'ready'}
      managedLinkRootDomain={
        configuration.status === 'ready' ? configuration.managedLinkRootDomain : null
      }
    />
  )
}
