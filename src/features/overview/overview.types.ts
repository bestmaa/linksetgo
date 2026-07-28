import type { BadgeTone } from '@/components/ui/badge'
import type { IconName } from '@/components/ui/icon'

export type MetricViewModel = {
  icon: IconName
  label: string
  note: string
  value: string
}

export type ActivityPointViewModel = {
  height: string
  label: string
  value: number
}

export type HealthViewModel = {
  detail: string
  label: string
  tone: 'success' | 'warning' | 'danger'
}

export type RecentLinkViewModel = {
  app: string
  href: string
  id: string
  name: string
  status: string
  statusTone: BadgeTone
  url: string
}

export type OverviewViewProps = {
  activity: readonly ActivityPointViewModel[]
  error: string | null
  greeting: string
  health: readonly HealthViewModel[]
  isLoading: boolean
  metrics: readonly MetricViewModel[]
  onCreateLink: () => void
  onRetry: () => void
  recentLinks: readonly RecentLinkViewModel[]
}
