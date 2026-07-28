import { domainToASCII } from 'node:url'

export type DomainStatus =
  | 'active'
  | 'association-incomplete'
  | 'certificate-ready'
  | 'pending-dns'
  | 'suspended'
  | 'verifying'

const hostnameLabelPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const slugPattern = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/

const reservedWorkspaceSlugs = new Set([
  'admin',
  'api',
  'app',
  'assets',
  'auth',
  'billing',
  'cdn',
  'console',
  'dashboard',
  'docs',
  'domains',
  'help',
  'login',
  'mail',
  'open',
  'relay',
  'root',
  'security',
  'signup',
  'status',
  'support',
  'verify',
  'webhooks',
  'www',
])

const transitions: Readonly<Record<DomainStatus, readonly DomainStatus[]>> = {
  active: ['association-incomplete', 'suspended'],
  'association-incomplete': ['active', 'certificate-ready', 'suspended'],
  'certificate-ready': ['association-incomplete', 'pending-dns', 'suspended'],
  'pending-dns': ['suspended', 'verifying'],
  suspended: ['pending-dns'],
  verifying: ['certificate-ready', 'pending-dns', 'suspended'],
}

export function normalizeHostname(input: unknown): string | null {
  if (typeof input !== 'string') {
    return null
  }

  const candidate = input.trim().replace(/\.$/, '').toLowerCase()
  if (
    candidate.length === 0 ||
    candidate.length > 253 ||
    /[\s/:@?#*]/.test(candidate) ||
    candidate.includes('..')
  ) {
    return null
  }

  const ascii = domainToASCII(candidate)
  if (!ascii || ascii.length > 253) {
    return null
  }

  return ascii.split('.').every((label) => hostnameLabelPattern.test(label)) ? ascii : null
}

export function normalizeWorkspaceSlug(input: unknown): string | null {
  if (typeof input !== 'string') {
    return null
  }

  const slug = input.trim().toLowerCase()
  if (!slugPattern.test(slug) || reservedWorkspaceSlugs.has(slug)) {
    return null
  }

  return slug
}

export function buildManagedWorkspaceHostname(
  workspaceSlug: string,
  managedRootDomain: string,
): string | null {
  const normalizedSlug = normalizeWorkspaceSlug(workspaceSlug)
  const normalizedRoot = normalizeHostname(managedRootDomain)

  if (!normalizedSlug || !normalizedRoot) {
    return null
  }

  return normalizeHostname(`${normalizedSlug}.${normalizedRoot}`)
}

export function buildWorkspacePublicLinkURL(input: {
  appKey: string
  hostname: string
  linkSlug: string
}): string | null {
  const hostname = normalizeHostname(input.hostname)
  const appKey = normalizePublicSlug(input.appKey)
  const linkSlug = normalizePublicSlug(input.linkSlug)

  if (!hostname || !appKey || !linkSlug) {
    return null
  }

  return `https://${hostname}/l/${appKey}/${linkSlug}`
}

export function canTransitionDomain(from: DomainStatus, to: DomainStatus): boolean {
  return transitions[from].includes(to)
}

function normalizePublicSlug(input: unknown): string | null {
  if (typeof input !== 'string') {
    return null
  }

  const slug = input.trim().toLowerCase()
  return slugPattern.test(slug) ? slug : null
}
