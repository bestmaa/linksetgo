import type { Metadata } from 'next'

import { VerifyEmailConnector } from '@/features/signup/verify-email.connector'

export const metadata: Metadata = {
  referrer: 'no-referrer',
  robots: { follow: false, index: false },
  title: 'Verify email',
}

export default function VerifyEmailPage() {
  return <VerifyEmailConnector />
}
