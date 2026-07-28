import 'dotenv/config'

import { register } from 'node:module'
import { getPayload } from 'payload'

import config from '../src/payload.config'
import { normalizeHostname } from '../src/lib/domain/workspace-domain'

register('./server-only-loader.mjs', import.meta.url)

const readBatchSize = (arguments_: string[]): number => {
  const index = arguments_.indexOf('--limit')
  if (index === -1) return 100
  const value = Number(arguments_[index + 1])
  if (!Number.isSafeInteger(value) || value < 1 || value > 100) {
    throw new Error('--limit must be an integer between 1 and 100.')
  }
  return value
}

const main = async (): Promise<void> => {
  if (process.env.RELAY_EDITION?.trim().toLowerCase() !== 'cloud') {
    throw new Error('Pending Cloud signup pruning is available only in Relay Cloud.')
  }
  const managedLinkRootDomain = normalizeHostname(process.env.MANAGED_LINK_ROOT_DOMAIN)
  if (!managedLinkRootDomain) {
    throw new Error('MANAGED_LINK_ROOT_DOMAIN must be one normalized hostname.')
  }

  const payload = await getPayload({ config: await config })
  try {
    const { pruneExpiredPendingCloudSignups } =
      await import('../src/lib/server/cloud-signup-service')
    const result = await pruneExpiredPendingCloudSignups({
      batchSize: readBatchSize(process.argv.slice(2)),
      managedLinkRootDomain,
      payload,
    })
    console.info(
      `Pending signup prune complete: scanned=${result.scanned} pruned=${result.pruned} skipped=${result.skipped}`,
    )
  } finally {
    await payload.destroy()
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Pending signup pruning failed.')
    process.exit(1)
  })
