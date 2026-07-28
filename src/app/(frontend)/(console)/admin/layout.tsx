import type { ReactNode } from 'react'

import { ShellConnector } from '@/features/shell/shell.connector'

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <ShellConnector>{children}</ShellConnector>
}
