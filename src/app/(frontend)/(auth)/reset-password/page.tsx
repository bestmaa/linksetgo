import type { Metadata } from 'next'

import { ResetPasswordConnector } from '@/features/account-recovery/reset-password.connector'
import { getLinksetGoEdition } from '@/lib/server/deployment-edition'

export const metadata: Metadata = {
  referrer: 'no-referrer',
  robots: { follow: false, index: false },
  title: 'Reset password',
}

export const dynamic = 'force-dynamic'

export default function ResetPasswordPage() {
  return <ResetPasswordConnector available={getLinksetGoEdition() === 'cloud'} />
}
