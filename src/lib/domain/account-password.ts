export const ACCOUNT_PASSWORD_MIN_LENGTH = 12
export const ACCOUNT_PASSWORD_MAX_LENGTH = 128
export const ACCOUNT_PASSWORD_REQUIREMENTS =
  'Use 12-128 characters with upper, lower, number, and symbol.'

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F]/

export function isStrongAccountPassword(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= ACCOUNT_PASSWORD_MIN_LENGTH &&
    value.length <= ACCOUNT_PASSWORD_MAX_LENGTH &&
    !CONTROL_CHARACTER_PATTERN.test(value) &&
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /[0-9]/.test(value) &&
    /[^A-Za-z0-9]/.test(value)
  )
}
