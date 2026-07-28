import type { BadgeTone } from '@/components/ui/badge'
import type { DomainConsoleDTO, DomainStatus } from '@/lib/client/payload-types'

const statusPresentation: Record<
  DomainStatus,
  { description: string; label: string; tone: BadgeTone }
> = {
  active: {
    description: 'DNS, managed TLS and mobile association checks are complete.',
    label: 'Active',
    tone: 'success',
  },
  'association-incomplete': {
    description: 'TLS is ready; Apple and Android association confirmation is still required.',
    label: 'Association incomplete',
    tone: 'warning',
  },
  'certificate-ready': {
    description: 'The TLS certificate is ready; association publishing is next.',
    label: 'Certificate ready',
    tone: 'blue',
  },
  'pending-dns': {
    description: 'Publish the exact CNAME and TXT records shown for this hostname.',
    label: 'Pending DNS',
    tone: 'neutral',
  },
  suspended: {
    description: 'Routing is disabled by the Relay operator. Contact your workspace owner.',
    label: 'Suspended',
    tone: 'danger',
  },
  verifying: {
    description: 'Relay is processing trusted DNS evidence supplied by the operator.',
    label: 'Verifying',
    tone: 'blue',
  },
}

export function domainStatusPresentation(status: DomainStatus) {
  return statusPresentation[status]
}

export function normalizeCustomHostnameDraft(value: string): string | null {
  const candidate = value.trim().replace(/\.$/, '').toLowerCase()
  if (
    !candidate ||
    candidate.length > 253 ||
    !candidate.includes('.') ||
    candidate.includes('..') ||
    /[\s/:@?#*]/.test(candidate) ||
    /^(?:\d{1,3}\.){3}\d{1,3}$/.test(candidate)
  ) {
    return null
  }

  try {
    const hostname = new URL(`https://${candidate}`).hostname
    return hostname && hostname !== 'localhost' && hostname.includes('.') ? hostname : null
  } catch {
    return null
  }
}

export function formatDomainDate(value: string | null | undefined): string {
  if (!value) return 'Not checked yet'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not checked yet'
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export function releaseGuidance(domain: Pick<DomainConsoleDTO, 'status' | 'type'>): string {
  if (domain.status === 'active') {
    return domain.type === 'custom'
      ? 'This hostname is ready. Add its Associated Domains entitlement and Android intent filter to a controlled mobile release, then complete a real-device tap test.'
      : 'The managed hostname is ready for mobile configuration and real-device testing.'
  }
  if (domain.status === 'suspended') {
    return 'Do not ship or advertise this hostname while routing is suspended.'
  }
  return 'Do not ship this hostname in an iOS or Android release yet. Wait for Active, then test the production build on a real device.'
}
