import { ACCOUNT_PASSWORD_REQUIREMENTS, isStrongAccountPassword } from './account-password'
import { isCloudVerificationToken } from './cloud-verification-token'

export const MAX_TEAM_INVITATION_BODY_BYTES = 8 * 1024
export const TEAM_INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000

export type TeamRole = 'admin' | 'member' | 'owner' | 'viewer'
export type TeamInvitationDeliveryMode = 'manual' | 'webhook'

export type CreateTeamInvitationInput = {
  delivery: TeamInvitationDeliveryMode
  email: string
  organizationId: string
  role: TeamRole
}

export type TeamMemberMutationInput =
  | {
      action: 'remove'
      organizationId: string
    }
  | {
      action: 'update'
      organizationId: string
      role: TeamRole
      status: 'active' | 'disabled'
    }

export type AcceptTeamInvitationInput = {
  name: string | null
  password: string | null
  token: string
}

type ParseResult<T> = { field?: string; message: string; ok: false } | { ok: true; value: T }

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F]/
const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/
const roles = new Set<TeamRole>(['admin', 'member', 'owner', 'viewer'])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasOnlyKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const allowed = new Set(keys)
  return Object.keys(value).every((key) => allowed.has(key))
}

export function normalizeTeamEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const email = value.trim().toLowerCase()
  return email.length >= 3 &&
    email.length <= 254 &&
    !CONTROL_CHARACTER_PATTERN.test(email) &&
    EMAIL_PATTERN.test(email)
    ? email
    : null
}

export function normalizeTeamIdentifier(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const id = value.trim()
  return ID_PATTERN.test(id) ? id : null
}

export function maskTeamEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@')
  const visible = local.slice(0, Math.min(2, local.length))
  return `${visible}${'*'.repeat(Math.max(3, local.length - visible.length))}@${domain}`
}

export function parseCreateTeamInvitation(value: unknown): ParseResult<CreateTeamInvitationInput> {
  if (!isRecord(value) || !hasOnlyKeys(value, ['delivery', 'email', 'organizationId', 'role'])) {
    return { message: 'Enter valid invitation details.', ok: false }
  }

  const email = normalizeTeamEmail(value.email)
  const organizationId = normalizeTeamIdentifier(value.organizationId)
  const role = value.role
  const delivery = value.delivery
  if (!email) {
    return { field: 'email', message: 'Enter a valid work email address.', ok: false }
  }
  if (!organizationId) return { message: 'Select an organization.', ok: false }
  if (typeof role !== 'string' || !roles.has(role as TeamRole)) {
    return { field: 'role', message: 'Select a valid organization role.', ok: false }
  }
  if (delivery !== 'webhook' && delivery !== 'manual') {
    return { message: 'Select a supported invitation delivery mode.', ok: false }
  }
  return {
    ok: true,
    value: { delivery, email, organizationId, role: role as TeamRole },
  }
}

export function parseTeamMemberMutation(value: unknown): ParseResult<TeamMemberMutationInput> {
  if (!isRecord(value)) return { message: 'Enter a valid member update.', ok: false }
  const organizationId = normalizeTeamIdentifier(value.organizationId)
  if (!organizationId) return { message: 'Select an organization.', ok: false }

  if (value.action === 'remove' && hasOnlyKeys(value, ['action', 'organizationId'])) {
    return { ok: true, value: { action: 'remove', organizationId } }
  }
  if (
    value.action !== 'update' ||
    !hasOnlyKeys(value, ['action', 'organizationId', 'role', 'status']) ||
    typeof value.role !== 'string' ||
    !roles.has(value.role as TeamRole) ||
    (value.status !== 'active' && value.status !== 'disabled')
  ) {
    return { message: 'Select a valid role and member status.', ok: false }
  }
  return {
    ok: true,
    value: {
      action: 'update',
      organizationId,
      role: value.role as TeamRole,
      status: value.status,
    },
  }
}

export function parseAcceptTeamInvitation(value: unknown): ParseResult<AcceptTeamInvitationInput> {
  if (!isRecord(value) || !hasOnlyKeys(value, ['name', 'password', 'token'])) {
    return { message: 'This invitation request is invalid.', ok: false }
  }
  if (!isCloudVerificationToken(value.token)) {
    return { message: 'This invitation link is invalid.', ok: false }
  }

  const hasNewAccountFields = value.name !== undefined || value.password !== undefined
  if (!hasNewAccountFields) {
    return { ok: true, value: { name: null, password: null, token: value.token } }
  }

  const name = typeof value.name === 'string' ? value.name.trim().replace(/\s+/g, ' ') : ''
  const password = typeof value.password === 'string' ? value.password : ''
  if (!name || name.length < 2 || name.length > 120 || CONTROL_CHARACTER_PATTERN.test(name)) {
    return { field: 'name', message: 'Enter your name using 2 to 120 characters.', ok: false }
  }
  if (!isStrongAccountPassword(password)) {
    return {
      field: 'password',
      message: ACCOUNT_PASSWORD_REQUIREMENTS,
      ok: false,
    }
  }
  return { ok: true, value: { name, password, token: value.token } }
}

export function parseTeamInvitationToken(value: unknown): ParseResult<string> {
  return isRecord(value) && hasOnlyKeys(value, ['token']) && isCloudVerificationToken(value.token)
    ? { ok: true, value: value.token }
    : { message: 'This invitation link is invalid.', ok: false }
}
