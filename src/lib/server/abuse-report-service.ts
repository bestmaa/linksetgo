import 'server-only'

import type { Payload } from 'payload'

import type { AbuseReportInput } from '@/lib/domain/abuse-report'
import { isPublicSlug } from '@/lib/domain/public-link'
import { getServerEnvironment } from './env'
import { privacySafeHash, privacySafeRequestKey } from './request-privacy'

type ResolvedTarget = {
  app?: number
  domain?: number
  link?: number
  workspace?: number
}

const linkPathPattern = /^\/l\/([^/]+)\/([^/]+)\/?$/

const numericID = (value: unknown): number | null => {
  if (typeof value === 'object' && value !== null && 'id' in value) {
    return numericID(value.id)
  }
  const id =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/.test(value)
        ? Number(value)
        : Number.NaN
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

async function resolveAppAndLink(input: {
  payload: Payload
  targetPath: string
  workspaceID?: number
}): Promise<Pick<ResolvedTarget, 'app' | 'link'>> {
  const match = linkPathPattern.exec(input.targetPath)
  const appSlug = match?.[1]
  const linkSlug = match?.[2]
  if (!appSlug || !linkSlug || !isPublicSlug(appSlug) || !isPublicSlug(linkSlug)) return {}

  const apps = await input.payload.find({
    collection: 'apps',
    depth: 0,
    limit: 2,
    overrideAccess: true,
    pagination: false,
    where: input.workspaceID
      ? {
          and: [{ slug: { equals: appSlug } }, { workspace: { equals: input.workspaceID } }],
        }
      : { slug: { equals: appSlug } },
  })
  if (apps.docs.length !== 1) return {}
  const app = apps.docs[0]
  if (!app) return {}

  const links = await input.payload.find({
    collection: 'deep-links',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    where: {
      and: [{ app: { equals: app.id } }, { slug: { equals: linkSlug } }],
    },
  })
  const link = links.docs[0]
  return {
    app: app.id,
    ...(link ? { link: link.id } : {}),
  }
}

async function resolveConfiguredTarget(
  payload: Payload,
  report: AbuseReportInput,
): Promise<ResolvedTarget> {
  const domains = await payload.find({
    collection: 'domains',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    where: { hostname: { equals: report.targetHostname } },
  })
  const domain = domains.docs[0]
  const workspaceID = domain ? numericID(domain.workspace) : null

  const environment = getServerEnvironment()
  const legacyHostname = new URL(environment.publicLinkBaseURL).hostname.toLowerCase()
  if (!domain && report.targetHostname !== legacyHostname) return {}

  const appAndLink = await resolveAppAndLink({
    payload,
    targetPath: report.targetPath,
    ...(workspaceID ? { workspaceID } : {}),
  })
  return {
    ...appAndLink,
    ...(domain ? { domain: domain.id } : {}),
    ...(workspaceID ? { workspace: workspaceID } : {}),
  }
}

export async function recordPublicAbuseReport(input: {
  payload: Payload
  report: AbuseReportInput
  request: Request
}): Promise<{ accepted: true; duplicate: boolean }> {
  const environment = getServerEnvironment()
  const reporterKeyHash = privacySafeRequestKey({
    request: input.request,
    secret: environment.eventHashSecret,
    trustProxyClientIPHeader: environment.trustProxyClientIPHeader,
  })
  const userAgent = input.request.headers.get('user-agent')
  const submissionHash = privacySafeHash(
    JSON.stringify({
      category: input.report.category,
      details: input.report.details,
      reporterContact: input.report.reporterContact ?? null,
      reporterKeyHash,
      targetHostname: input.report.targetHostname,
      targetPath: input.report.targetPath,
    }),
    environment.eventHashSecret,
  )

  const duplicate = await input.payload.find({
    collection: 'abuse-reports',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    where: { submissionHash: { equals: submissionHash } },
  })
  if (duplicate.docs.length > 0) return { accepted: true, duplicate: true }

  const resolved = await resolveConfiguredTarget(input.payload, input.report)
  try {
    await input.payload.create({
      collection: 'abuse-reports',
      depth: 0,
      overrideAccess: true,
      data: {
        ...resolved,
        category: input.report.category,
        details: input.report.details,
        evidenceSnapshot: {
          resolvedApp: Boolean(resolved.app),
          resolvedDomain: Boolean(resolved.domain),
          resolvedLink: Boolean(resolved.link),
          targetHostname: input.report.targetHostname,
          targetPath: input.report.targetPath,
        },
        receivedAt: new Date().toISOString(),
        ...(input.report.reporterContact ? { reporterContact: input.report.reporterContact } : {}),
        reporterKeyHash,
        status: 'received',
        submissionHash,
        targetHostname: input.report.targetHostname,
        targetPath: input.report.targetPath,
        ...(userAgent
          ? {
              userAgentHash: privacySafeHash(
                userAgent.slice(0, 1_024),
                environment.eventHashSecret,
              ),
            }
          : {}),
      },
    })
    return { accepted: true, duplicate: false }
  } catch (error) {
    // A concurrent replay can race the preflight read into the unique index.
    const racedDuplicate = await input.payload.find({
      collection: 'abuse-reports',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      where: { submissionHash: { equals: submissionHash } },
    })
    if (racedDuplicate.docs.length > 0) return { accepted: true, duplicate: true }
    throw error
  }
}
