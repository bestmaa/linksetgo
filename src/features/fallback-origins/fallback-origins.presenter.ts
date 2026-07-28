import type {
  FallbackOriginConsoleDTO,
  FallbackOriginInstructionsDTO,
} from '@/lib/client/payload-types'

import type {
  FallbackOriginRecordViewModel,
  FallbackOriginRowViewModel,
} from './fallback-origins.types'

const status = {
  pending: { label: 'Pending DNS', tone: 'warning' },
  revoked: { label: 'Revoked', tone: 'danger' },
  verified: { label: 'Verified', tone: 'success' },
  verifying: { label: 'Verifying', tone: 'blue' },
} as const

const dateLabel = (value: null | string | undefined): string => {
  if (!value) return 'Never'
  const date = new Date(value)
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
    : 'Unknown'
}

export function presentFallbackOriginRows(input: {
  origins: readonly FallbackOriginConsoleDTO[]
  onSelect: (id: string) => void
  selectedID: string | null
}): FallbackOriginRowViewModel[] {
  return input.origins.map((origin) => ({
    hostname: origin.hostname,
    id: String(origin.id),
    isSelected: String(origin.id) === input.selectedID,
    lastCheckedLabel: dateLabel(origin.lastCheckedAt),
    onSelect: () => input.onSelect(String(origin.id)),
    status: origin.status,
    statusLabel: status[origin.status].label,
    statusTone: status[origin.status].tone,
  }))
}

export function presentFallbackOriginRecord(
  instructions: FallbackOriginInstructionsDTO | null,
  onCopy: (label: string, value: string) => void,
): FallbackOriginRecordViewModel | null {
  if (!instructions) return null
  return {
    name: instructions.record.name,
    onCopyName: () => onCopy('TXT name', instructions.record.name),
    onCopyValue: () => onCopy('TXT value', instructions.record.value),
    value: instructions.record.value,
  }
}
