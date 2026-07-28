import type { Metadata } from 'next'

import { TeamInviteConnector } from '@/features/team-invite/team-invite.connector'

export const metadata: Metadata = {
  referrer: 'no-referrer',
  robots: { follow: false, index: false },
  title: 'Team invitation',
}

export default function TeamInvitePage() {
  return <TeamInviteConnector />
}
