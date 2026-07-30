import 'dotenv/config'

import { register } from 'node:module'
import { getPayload } from 'payload'

import config from '../src/payload.config'
import type { User } from '../src/payload-types'

register('./server-only-loader.mjs', import.meta.url)

type CommandOptions = {
  apply: boolean
  pageSize: number
}

const usage =
  'Usage: npm run backfill:fallback-safety -- [--dry-run | --apply] [--page-size <1-100>]'

function parsePageSize(value: string | undefined): number {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new Error('--page-size must be an integer between 1 and 100.')
  }
  return parsed
}

function parseArguments(arguments_: string[]): CommandOptions {
  let apply = false
  let explicitDryRun = false
  let pageSize = 50

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]
    if (argument === '--apply') {
      apply = true
      continue
    }
    if (argument === '--dry-run') {
      explicitDryRun = true
      continue
    }
    if (argument === '--page-size') {
      pageSize = parsePageSize(arguments_[index + 1])
      index += 1
      continue
    }
    if (argument?.startsWith('--page-size=')) {
      pageSize = parsePageSize(argument.slice('--page-size='.length))
      continue
    }
    throw new Error(usage)
  }
  if (apply && explicitDryRun) throw new Error('Choose either --dry-run or --apply, not both.')
  return { apply, pageSize }
}

async function activePlatformOperator(
  payload: Awaited<ReturnType<typeof getPayload>>,
): Promise<User> {
  const result = await payload.find({
    collection: 'users',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    sort: 'id',
    where: {
      and: [{ role: { equals: 'super-admin' } }, { status: { equals: 'active' } }],
    },
  })
  const actor = result.docs[0]
  if (!actor) throw new Error('Apply mode requires one active platform super-admin.')
  return actor
}

const main = async (): Promise<void> => {
  if (process.env.RELAY_EDITION?.trim().toLowerCase() !== 'cloud') {
    throw new Error('Fallback URL safety backfill is available only in LinksetGo Cloud.')
  }
  const options = parseArguments(process.argv.slice(2))
  const payload = await getPayload({ config: await config })
  try {
    const actor = options.apply ? await activePlatformOperator(payload) : undefined
    const { backfillFallbackURLSafetyRegistrations } =
      await import('../src/lib/server/fallback-url-safety-backfill')
    const summary = await backfillFallbackURLSafetyRegistrations({
      ...(actor ? { actor } : {}),
      apply: options.apply,
      pageSize: options.pageSize,
      payload,
    })
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
    if (summary.failures > 0) {
      throw new Error('Fallback URL safety backfill completed with persistence failures.')
    }
  } finally {
    await payload.destroy()
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Fallback URL safety backfill failed.')
    process.exit(1)
  })
