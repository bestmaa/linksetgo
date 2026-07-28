import { normalizeHostname } from './workspace-domain'

export type DomainActionInput =
  | {
      action: 'confirm-associations'
      confirmedHostname: string
      workspaceID: string
    }
  | {
      action: 'verify'
      workspaceID: string
    }

const identifierPattern = /^[A-Za-z0-9_-]{1,128}$/

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const exactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

export function parseDomainActionInput(value: unknown): DomainActionInput | null {
  if (!isRecord(value) || typeof value.workspaceId !== 'string') return null
  const workspaceID = value.workspaceId.trim()
  if (!identifierPattern.test(workspaceID)) return null

  if (value.action === 'verify' && exactKeys(value, ['action', 'workspaceId'])) {
    return { action: 'verify', workspaceID }
  }
  if (
    value.action === 'confirm-associations' &&
    value.confirmReleasedApps === true &&
    typeof value.hostname === 'string' &&
    exactKeys(value, ['action', 'confirmReleasedApps', 'hostname', 'workspaceId'])
  ) {
    const confirmedHostname = normalizeHostname(value.hostname)
    return confirmedHostname
      ? { action: 'confirm-associations', confirmedHostname, workspaceID }
      : null
  }
  return null
}
