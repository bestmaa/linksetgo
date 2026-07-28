const VERIFICATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

export function isCloudVerificationToken(value: unknown): value is string {
  return typeof value === 'string' && VERIFICATION_TOKEN_PATTERN.test(value)
}
