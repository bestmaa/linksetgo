import type { Metadata } from 'next'

import { SettingsConnector } from '@/features/settings/settings.connector'

export const metadata: Metadata = {
  title: 'Settings',
}

export default function SettingsPage() {
  return <SettingsConnector />
}
