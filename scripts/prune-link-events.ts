import 'dotenv/config'

import { register } from 'node:module'
import { getPayload } from 'payload'

import config from '../src/payload.config'

register('./server-only-loader.mjs', import.meta.url)

const main = async (): Promise<void> => {
  const argumentsSet = new Set(process.argv.slice(2))
  const execute = argumentsSet.has('--execute')
  const allowTestDatabase = argumentsSet.has('--allow-test-database')

  if ([...argumentsSet].some((value) => !['--allow-test-database', '--execute'].includes(value))) {
    throw new Error('Usage: npm run analytics:prune -- [--execute] [--allow-test-database]')
  }

  const payload = await getPayload({ config: await config })
  try {
    const { pruneExpiredLinkEvents } = await import('../src/lib/server/analytics-retention-prune')
    const report = await pruneExpiredLinkEvents(payload, {
      allowTestDatabase,
      dryRun: !execute,
    })
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  } finally {
    await payload.destroy()
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Analytics retention pruning failed.')
    process.exit(1)
  })
