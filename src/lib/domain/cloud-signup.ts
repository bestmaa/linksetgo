import { normalizeWorkspaceSlug } from './workspace-domain'

export const MAX_CLOUD_SIGNUP_BODY_BYTES = 16 * 1024
export const CLOUD_VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000
export const CLOUD_PENDING_SIGNUP_MAX_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000
export const CLOUD_PENDING_SIGNUP_RECLAIM_GRACE_MS = 7 * 24 * 60 * 60 * 1000

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F]/
const SIGNUP_FIELDS = new Set([
  'acceptTerms',
  'email',
  'name',
  'organizationName',
  'password',
  'workspaceSlug',
])

export type CloudSignupInput = {
  acceptTerms: true
  email: string
  name: string
  organizationName: string
  password: string
  workspaceSlug: string
}

export type CloudSignupValidation =
  | { ok: true; value: CloudSignupInput }
  | { ok: false; field: keyof CloudSignupInput | 'form'; message: string }

export type CloudSignupGate =
  { ok: true } | { ok: false; code: 'COMMUNITY_EDITION' | 'SIGNUP_DISABLED' }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const cleanName = (value: unknown): null | string => {
  if (typeof value !== 'string') return null
  const cleaned = value.trim().replace(/\s+/g, ' ')
  return cleaned && !CONTROL_CHARACTER_PATTERN.test(cleaned) ? cleaned : null
}

export function evaluateCloudSignupGate(input: {
  cloudSignupEnabled: string | undefined
  linksetGoEdition: string | undefined
}): CloudSignupGate {
  if (input.linksetGoEdition?.trim().toLowerCase() !== 'cloud') {
    return { ok: false, code: 'COMMUNITY_EDITION' }
  }
  return input.cloudSignupEnabled?.trim().toLowerCase() === 'true'
    ? { ok: true }
    : { ok: false, code: 'SIGNUP_DISABLED' }
}

export function parseCloudSignupInput(value: unknown): CloudSignupValidation {
  if (!isRecord(value)) {
    return { ok: false, field: 'form', message: 'Enter the required account details.' }
  }
  if (Object.keys(value).some((field) => !SIGNUP_FIELDS.has(field))) {
    return { ok: false, field: 'form', message: 'The signup request contains unknown fields.' }
  }

  const name = cleanName(value.name)
  if (!name || name.length < 2 || name.length > 120) {
    return { ok: false, field: 'name', message: 'Enter your name using 2 to 120 characters.' }
  }

  const email = typeof value.email === 'string' ? value.email.trim().toLowerCase() : ''
  if (
    email.length < 3 ||
    email.length > 254 ||
    CONTROL_CHARACTER_PATTERN.test(email) ||
    !EMAIL_PATTERN.test(email)
  ) {
    return { ok: false, field: 'email', message: 'Enter a valid work email address.' }
  }

  const password = typeof value.password === 'string' ? value.password : ''
  if (
    password.length < 12 ||
    password.length > 128 ||
    CONTROL_CHARACTER_PATTERN.test(password) ||
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/[0-9]/.test(password) ||
    !/[^A-Za-z0-9]/.test(password)
  ) {
    return {
      ok: false,
      field: 'password',
      message: 'Use 12–128 characters with upper, lower, number, and symbol.',
    }
  }

  const organizationName = cleanName(value.organizationName)
  if (!organizationName || organizationName.length < 2 || organizationName.length > 120) {
    return {
      ok: false,
      field: 'organizationName',
      message: 'Enter an organization name using 2 to 120 characters.',
    }
  }

  const workspaceSlug = normalizeWorkspaceSlug(value.workspaceSlug)
  if (!workspaceSlug || workspaceSlug.length > 63) {
    return {
      ok: false,
      field: 'workspaceSlug',
      message: 'Use an available workspace slug with letters, numbers, and single hyphens.',
    }
  }

  if (value.acceptTerms !== true) {
    return {
      ok: false,
      field: 'acceptTerms',
      message: 'Accept the Terms and Privacy Policy to create an account.',
    }
  }

  return {
    ok: true,
    value: {
      acceptTerms: true,
      email,
      name,
      organizationName,
      password,
      workspaceSlug,
    },
  }
}
