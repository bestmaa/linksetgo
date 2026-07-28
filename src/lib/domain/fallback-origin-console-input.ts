export const MAX_FALLBACK_ORIGIN_REQUEST_BYTES = 2_048

type RegistrationInput = { ok: true; hostname: unknown; workspaceID: string } | { ok: false }

type ActionInput = { ok: true; action: 'revoke' | 'verify'; workspaceID: string } | { ok: false }

const identifierPattern = /^[A-Za-z0-9_-]{1,128}$/

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const workspaceID = (value: unknown): string | null =>
  typeof value === 'string' && identifierPattern.test(value.trim()) ? value.trim() : null

export function parseFallbackOriginRegistration(value: unknown): RegistrationInput {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 2 ||
    !Object.hasOwn(value, 'hostname') ||
    !Object.hasOwn(value, 'workspaceId')
  ) {
    return { ok: false }
  }
  const id = workspaceID(value.workspaceId)
  return id ? { hostname: value.hostname, ok: true, workspaceID: id } : { ok: false }
}

export function parseFallbackOriginAction(value: unknown): ActionInput {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 2 ||
    !Object.hasOwn(value, 'action') ||
    !Object.hasOwn(value, 'workspaceId')
  ) {
    return { ok: false }
  }
  const id = workspaceID(value.workspaceId)
  const action = value.action
  return id && (action === 'verify' || action === 'revoke')
    ? { action, ok: true, workspaceID: id }
    : { ok: false }
}
