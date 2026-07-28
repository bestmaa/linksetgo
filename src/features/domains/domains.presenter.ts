import type { DomainConsoleDTO, DomainInstructionsDTO } from '@/lib/client/payload-types'

import { domainStatusPresentation, formatDomainDate, releaseGuidance } from './domains.helpers'
import type {
  DomainInstructionRecordViewModel,
  DomainRowViewModel,
  SelectedDomainViewModel,
} from './domains.types'

export function presentDomainRows(input: {
  domains: readonly DomainConsoleDTO[]
  onSelect: (domainID: string) => void
  selectedDomainID: string | null
}): DomainRowViewModel[] {
  return input.domains.map((domain) => {
    const id = String(domain.id)
    const presentation = domainStatusPresentation(domain.status)
    return {
      hostname: domain.hostname,
      id,
      isSelected: id === input.selectedDomainID,
      lastCheckedLabel: formatDomainDate(domain.lastCheckedAt),
      onSelect: () => input.onSelect(id),
      status: domain.status,
      statusDescription: presentation.description,
      statusLabel: presentation.label,
      statusTone: presentation.tone,
      type: domain.type,
      typeLabel: domain.type === 'managed' ? 'Managed domain' : 'Custom domain',
    }
  })
}

export function presentDomainInstructions(
  instructions: DomainInstructionsDTO | null,
  onCopy: (label: string, value: string) => void,
): DomainInstructionRecordViewModel[] {
  if (!instructions) return []
  return [
    {
      name: instructions.records.cname.name,
      onCopyName: () => onCopy('CNAME name', instructions.records.cname.name),
      onCopyValue: () => onCopy('CNAME target', instructions.records.cname.target),
      type: 'CNAME',
      value: instructions.records.cname.target,
    },
    {
      name: instructions.records.ownership.name,
      onCopyName: () => onCopy('TXT name', instructions.records.ownership.name),
      onCopyValue: () => onCopy('TXT value', instructions.records.ownership.value),
      type: 'TXT',
      value: instructions.records.ownership.value,
    },
  ]
}

export function presentSelectedDomain(input: {
  actionError: string | null
  actionLabel: string | null
  domain: DomainConsoleDTO | null
  instructions: readonly DomainInstructionRecordViewModel[]
  instructionsError: string | null
  isActionRunning: boolean
  isLoadingInstructions: boolean
  onPrimaryAction: (() => void) | null
  row: DomainRowViewModel | undefined
}): SelectedDomainViewModel | null {
  if (!input.domain || !input.row) return null
  return {
    ...input.row,
    actionError: input.actionError,
    actionLabel: input.actionLabel,
    instructions: input.instructions,
    instructionsError: input.instructionsError,
    isActionRunning: input.isActionRunning,
    isLoadingInstructions: input.isLoadingInstructions,
    onPrimaryAction: input.onPrimaryAction,
    releaseGuidance: releaseGuidance(input.domain),
    verificationError: input.domain.lastVerificationError ?? null,
  }
}
