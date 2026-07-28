import type { ChangeEventHandler } from 'react'

import type { BadgeTone } from '@/components/ui/badge'

export type AppCardViewModel = {
  description: string
  href: string
  id: string
  initials: string
  linkCountLabel: string
  name: string
  platforms: readonly string[]
  slug: string
  status: string
  statusTone: BadgeTone
}

export type AppsViewProps = {
  apps: readonly AppCardViewModel[]
  error: string | null
  isLoading: boolean
  onCreate: () => void
  onRetry: () => void
  onSearchChange: ChangeEventHandler<HTMLInputElement>
  search: string
}
