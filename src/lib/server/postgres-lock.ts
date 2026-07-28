import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import type { PostgresDB, TransactionPg } from '@payloadcms/drizzle'
import { APIError, type PayloadRequest } from 'payload'

export async function requiredTransaction(
  req: PayloadRequest,
): Promise<PostgresDB | TransactionPg> {
  const transactionID = req.transactionID ? await req.transactionID : null
  if (!transactionID) {
    throw new APIError('This operation requires an atomic database transaction.', 503)
  }

  const adapter = req.payload.db as unknown as PostgresAdapter
  const transaction = adapter.sessions[String(transactionID)]?.db
  if (!transaction) {
    throw new APIError('This operation requires an active database transaction.', 503)
  }
  return transaction
}

export async function acquireTransactionLock(
  req: PayloadRequest,
  namespace: string,
  key: string,
): Promise<void> {
  const transaction = await requiredTransaction(req)
  await transaction.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${namespace}:${key}`}, 0))`,
  )
}
