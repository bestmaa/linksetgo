import 'server-only'

import {
  APIError,
  commitTransaction,
  initTransaction,
  killTransaction,
  type PayloadRequest,
} from 'payload'

import { isPlatformSuperAdmin, relationID } from './tenant-context'

type AbuseCaseSeverity = 'critical' | 'high' | 'low' | 'medium'
type AbuseCaseStatus = 'actioned' | 'closed' | 'investigating' | 'open'

const statuses = new Set<AbuseCaseStatus>(['actioned', 'closed', 'investigating', 'open'])
const transitions: Readonly<Record<AbuseCaseStatus, readonly AbuseCaseStatus[]>> = {
  actioned: ['closed', 'investigating'],
  closed: [],
  investigating: ['actioned', 'closed'],
  open: ['closed', 'investigating'],
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function numericID(value: unknown, label: string): number {
  const raw = relationID(value)
  const id = raw ? Number(raw) : Number.NaN
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new APIError(`${label} is invalid.`, 400)
  }
  return id
}

const selectedRelation = (
  record: Record<string, unknown>,
  field: 'app' | 'domain' | 'link' | 'workspace',
): number | undefined => {
  const id = relationID(record[field])
  if (!id) return undefined
  const parsed = Number(id)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined
}

function assertOperator(req: PayloadRequest): number {
  if (!isPlatformSuperAdmin(req) || !req.user?.id) {
    throw new APIError('Platform super-admin access is required.', 403)
  }
  return numericID(req.user.id, 'Operator')
}

export async function openAbuseCase(input: {
  primaryReportID: number | string
  req: PayloadRequest
  severity: AbuseCaseSeverity
  title: string
}): Promise<{ caseID: number }> {
  const actor = assertOperator(input.req)
  const reportID = numericID(input.primaryReportID, 'Primary report')
  const title = input.title.trim()
  if (title.length < 3 || title.length > 200) {
    throw new APIError('Case title must be between 3 and 200 characters.', 400)
  }

  const ownsTransaction = input.req.transactionID ? false : await initTransaction(input.req)
  if (!input.req.transactionID) throw new Error('Could not initialize the abuse-case transaction.')

  try {
    const reportValue = await input.req.payload.findByID({
      collection: 'abuse-reports',
      id: reportID,
      depth: 0,
      overrideAccess: true,
      req: input.req,
    })
    const report = isRecord(reportValue) ? reportValue : {}
    const app = selectedRelation(report, 'app')
    const domain = selectedRelation(report, 'domain')
    const link = selectedRelation(report, 'link')
    const workspace = selectedRelation(report, 'workspace')
    const openedAt = new Date().toISOString()
    const abuseCase = await input.req.payload.create({
      collection: 'abuse-cases',
      depth: 0,
      overrideAccess: true,
      req: input.req,
      data: {
        ...(app ? { app } : {}),
        ...(domain ? { domain } : {}),
        ...(link ? { link } : {}),
        openedAt,
        primaryReport: reportID,
        severity: input.severity,
        status: 'open',
        title,
        ...(workspace ? { workspace } : {}),
      },
    })
    await input.req.payload.create({
      collection: 'abuse-case-events',
      depth: 0,
      overrideAccess: true,
      req: input.req,
      data: {
        abuseCase: abuseCase.id,
        actor,
        eventType: 'opened',
        occurredAt: openedAt,
        summary: `Opened from abuse report ${String(reportID)}`,
      },
    })
    await input.req.payload.update({
      collection: 'abuse-reports',
      id: reportID,
      depth: 0,
      overrideAccess: true,
      req: input.req,
      data: { status: 'attached-to-case' },
    })

    if (ownsTransaction) await commitTransaction(input.req)
    return { caseID: abuseCase.id }
  } catch (error) {
    if (ownsTransaction) await killTransaction(input.req)
    throw error
  }
}

export async function transitionAbuseCase(input: {
  abuseCaseID: number | string
  nextStatus: AbuseCaseStatus
  req: PayloadRequest
  summary: string
}): Promise<void> {
  const actor = assertOperator(input.req)
  const abuseCaseID = numericID(input.abuseCaseID, 'Abuse case')
  const summary = input.summary.trim()
  if (summary.length < 3 || summary.length > 500) {
    throw new APIError('Audit summary must be between 3 and 500 characters.', 400)
  }

  const ownsTransaction = input.req.transactionID ? false : await initTransaction(input.req)
  if (!input.req.transactionID) throw new Error('Could not initialize the abuse-case transaction.')
  try {
    const current = await input.req.payload.findByID({
      collection: 'abuse-cases',
      id: abuseCaseID,
      depth: 0,
      overrideAccess: true,
      req: input.req,
    })
    if (!statuses.has(current.status as AbuseCaseStatus)) {
      throw new APIError('The abuse case has an invalid status.', 409)
    }
    const previousStatus = current.status as AbuseCaseStatus
    if (
      input.nextStatus !== previousStatus &&
      !transitions[previousStatus].includes(input.nextStatus)
    ) {
      throw new APIError(
        `Abuse case cannot move from ${previousStatus} to ${input.nextStatus}.`,
        409,
      )
    }
    if (input.nextStatus === previousStatus) {
      if (ownsTransaction) await commitTransaction(input.req)
      return
    }

    const occurredAt = new Date().toISOString()
    await input.req.payload.update({
      collection: 'abuse-cases',
      id: abuseCaseID,
      depth: 0,
      overrideAccess: true,
      req: input.req,
      data: {
        ...(input.nextStatus === 'closed' ? { closedAt: occurredAt } : { closedAt: null }),
        status: input.nextStatus,
      },
    })
    await input.req.payload.create({
      collection: 'abuse-case-events',
      depth: 0,
      overrideAccess: true,
      req: input.req,
      data: {
        abuseCase: abuseCaseID,
        actor,
        eventType: 'status-changed',
        occurredAt,
        summary,
      },
    })
    if (ownsTransaction) await commitTransaction(input.req)
  } catch (error) {
    if (ownsTransaction) await killTransaction(input.req)
    throw error
  }
}
