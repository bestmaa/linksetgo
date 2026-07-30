import 'server-only'

import { resolveTxt } from 'node:dns/promises'

import type {
  DNSOwnershipEvidenceProvider,
  TXTEvidence,
} from '@/lib/application/dns-evidence-provider'
import { normalizeFallbackOriginHostname } from '@/lib/domain/fallback-origin'

export type ResolveTXTImplementation = (
  recordName: string,
) => Promise<readonly (readonly string[])[]>

const recordPrefix = '_linksetgo-fallback.'
const maximumRecords = 50
const maximumChunksPerRecord = 128
const maximumRecordBytes = 1_024
const maximumTotalBytes = 16 * 1_024
const resolverTimeoutMilliseconds = 8_000

function normalizeTXTRecordName(value: string): string | null {
  const trimmed = value.trim().toLowerCase().replace(/\.$/, '')
  if (!trimmed.startsWith(recordPrefix)) return null
  const hostname = normalizeFallbackOriginHostname(trimmed.slice(recordPrefix.length))
  return hostname && trimmed === `${recordPrefix}${hostname}` ? trimmed : null
}

function isMissingRecordError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false
  return error.code === 'ENODATA' || error.code === 'ENOTFOUND'
}

async function resolveWithTimeout(
  resolveTXT: ResolveTXTImplementation,
  recordName: string,
  timeoutMilliseconds: number,
): Promise<readonly (readonly string[])[]> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      resolveTXT(recordName),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error('Fallback-origin DNS resolution timed out.')),
          timeoutMilliseconds,
        )
      }),
    ])
  } finally {
    if (timeout !== undefined) clearTimeout(timeout)
  }
}

function boundedTXTValues(records: unknown): string[] {
  if (!Array.isArray(records) || records.length > maximumRecords) {
    throw new Error('Built-in fallback-origin DNS resolver returned invalid evidence.')
  }

  const values: string[] = []
  let totalBytes = 0
  for (const record of records) {
    if (
      !Array.isArray(record) ||
      record.length > maximumChunksPerRecord ||
      !record.every((chunk) => typeof chunk === 'string')
    ) {
      throw new Error('Built-in fallback-origin DNS resolver returned invalid evidence.')
    }

    let recordBytes = 0
    for (const chunk of record) {
      recordBytes += Buffer.byteLength(chunk, 'utf8')
      if (recordBytes > maximumRecordBytes) {
        throw new Error('Built-in fallback-origin DNS resolver returned too much evidence.')
      }
    }
    totalBytes += recordBytes
    if (totalBytes > maximumTotalBytes) {
      throw new Error('Built-in fallback-origin DNS resolver returned too much evidence.')
    }
    values.push(record.join(''))
  }
  return values
}

export function createNodeFallbackOriginDNSProvider(
  resolveTXT: ResolveTXTImplementation = resolveTxt,
  now: () => Date = () => new Date(),
  timeoutMilliseconds = resolverTimeoutMilliseconds,
): DNSOwnershipEvidenceProvider {
  const boundedTimeout = Math.max(
    1,
    Math.min(resolverTimeoutMilliseconds, Math.floor(timeoutMilliseconds)),
  )
  return {
    async lookupTXT(recordName): Promise<TXTEvidence> {
      const normalizedRecordName = normalizeTXTRecordName(recordName)
      if (!normalizedRecordName) {
        throw new Error('Fallback-origin verification received an invalid TXT record name.')
      }

      let records: readonly (readonly string[])[]
      try {
        records = await resolveWithTimeout(resolveTXT, normalizedRecordName, boundedTimeout)
      } catch (error) {
        if (isMissingRecordError(error)) records = []
        else throw new Error('Built-in fallback-origin DNS resolver is unavailable.')
      }

      const observedAt = now()
      if (!Number.isFinite(observedAt.getTime())) {
        throw new Error('Built-in fallback-origin DNS resolver returned an invalid observation.')
      }
      return {
        observedAt: observedAt.toISOString(),
        values: boundedTXTValues(records),
      }
    },
  }
}
