export const MAX_ABUSE_REPORT_BODY_BYTES = 8_192

export type AbuseCategory = 'impersonation' | 'malware' | 'other' | 'phishing' | 'spam'

export type AbuseReportInput = {
  category: AbuseCategory
  details: string
  reporterContact?: string
  targetHostname: string
  targetPath: string
}

export type AbuseReportParseResult =
  { ok: true; bot: boolean; value: AbuseReportInput } | { ok: false; message: string }

const categories = new Set<AbuseCategory>(['impersonation', 'malware', 'other', 'phishing', 'spam'])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function normalizeContact(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') return null
  const email = value.trim().toLowerCase()
  if (email.length > 320 || email.length < 3 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return null
  }
  return email
}

export function parseAbuseReportInput(value: unknown): AbuseReportParseResult {
  if (
    !isRecord(value) ||
    !hasOnlyObjectKeys(value, ['category', 'details', 'reporterContact', 'targetURL', 'website'])
  ) {
    return { ok: false, message: 'Enter a valid abuse report.' }
  }

  const category = value.category
  const details = typeof value.details === 'string' ? value.details.trim() : ''
  const contact = normalizeContact(value.reporterContact)
  if (
    typeof category !== 'string' ||
    !categories.has(category as AbuseCategory) ||
    details.length < 10 ||
    details.length > 4_000 ||
    contact === null
  ) {
    return { ok: false, message: 'Enter a valid abuse category, description, and contact.' }
  }

  if (typeof value.targetURL !== 'string' || value.targetURL.length > 2_048) {
    return { ok: false, message: 'Enter the Relay link you are reporting.' }
  }

  let targetURL: URL
  try {
    targetURL = new URL(value.targetURL)
  } catch {
    return { ok: false, message: 'Enter a valid absolute Relay HTTPS URL.' }
  }
  if (
    targetURL.protocol !== 'https:' ||
    targetURL.username ||
    targetURL.password ||
    targetURL.port ||
    !targetURL.hostname ||
    targetURL.pathname.length > 512
  ) {
    return { ok: false, message: 'Enter a valid absolute Relay HTTPS URL.' }
  }

  const honeypot = value.website
  if (honeypot !== undefined && typeof honeypot !== 'string') {
    return { ok: false, message: 'Enter a valid abuse report.' }
  }

  return {
    ok: true,
    bot: typeof honeypot === 'string' && honeypot.trim().length > 0,
    value: {
      category: category as AbuseCategory,
      details,
      ...(contact ? { reporterContact: contact } : {}),
      targetHostname: targetURL.hostname.toLowerCase().replace(/\.$/, ''),
      targetPath: targetURL.pathname || '/',
    },
  }
}
import { hasOnlyObjectKeys } from './exact-object'
