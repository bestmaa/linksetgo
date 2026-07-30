import { ACCOUNT_PASSWORD_REQUIREMENTS, isStrongAccountPassword } from './account-password'

export { isStrongAccountPassword } from './account-password'

export const MAX_ACCOUNT_RECOVERY_BODY_BYTES = 4_096
export const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1_000

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// 32 random bytes encoded as unpadded base64url. Keeping the exact encoded
// length prevents weaker caller-supplied tokens from reaching the database.
const RESET_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F]/

type EmailResult = { ok: true; email: string } | { ok: false; message: string }
type ResetResult = { ok: true; password: string; token: string } | { ok: false; message: string }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export function normalizeAccountEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const email = value.trim().toLowerCase()
  return email.length >= 3 &&
    email.length <= 254 &&
    !CONTROL_CHARACTER_PATTERN.test(email) &&
    EMAIL_PATTERN.test(email)
    ? email
    : null
}

export function isPasswordResetToken(value: unknown): value is string {
  return typeof value === 'string' && RESET_TOKEN_PATTERN.test(value)
}

export function parseAccountEmailRequest(value: unknown): EmailResult {
  if (!isRecord(value) || Object.keys(value).length !== 1 || !Object.hasOwn(value, 'email')) {
    return { ok: false, message: 'Enter a valid account email.' }
  }
  const email = normalizeAccountEmail(value.email)
  return email ? { ok: true, email } : { ok: false, message: 'Enter a valid account email.' }
}

export function parsePasswordResetRequest(value: unknown): ResetResult {
  if (
    !isRecord(value) ||
    Object.keys(value).some((field) => field !== 'password' && field !== 'token') ||
    Object.keys(value).length !== 2 ||
    !isPasswordResetToken(value.token) ||
    !isStrongAccountPassword(value.password)
  ) {
    return {
      ok: false,
      message: `Use a valid reset link. ${ACCOUNT_PASSWORD_REQUIREMENTS}`,
    }
  }
  return { ok: true, password: value.password, token: value.token }
}
