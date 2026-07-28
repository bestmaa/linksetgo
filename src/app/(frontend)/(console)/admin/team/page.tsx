import type { Metadata } from 'next'

import { TeamConnector } from '@/features/team/team.connector'

export const metadata: Metadata = {
  title: 'Team',
}

export default function TeamPage() {
  return <TeamConnector />
}
