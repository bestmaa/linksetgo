import 'server-only'

import { randomInt } from 'node:crypto'

const defaultMinimumMilliseconds = 400
const defaultJitterMilliseconds = 100

type TimingDependencies = {
  jitter?: () => number
  minimumMilliseconds?: number
  now?: () => number
  sleep?: (milliseconds: number) => Promise<void>
}

const defaultSleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })

/**
 * Adds the same bounded floor and random jitter to accepted account lookup
 * responses. Database work still happens normally; only the public completion
 * time is normalized so a missing account is not observably faster.
 */
export async function waitForNonEnumeratingAccountResponse(
  startedAtMilliseconds: number,
  dependencies: TimingDependencies = {},
): Promise<void> {
  const minimumMilliseconds = dependencies.minimumMilliseconds ?? defaultMinimumMilliseconds
  if (
    !Number.isFinite(startedAtMilliseconds) ||
    !Number.isSafeInteger(minimumMilliseconds) ||
    minimumMilliseconds < 0 ||
    minimumMilliseconds > 5_000
  ) {
    throw new Error('Account response timing configuration is invalid.')
  }

  const jitter = dependencies.jitter?.() ?? randomInt(defaultJitterMilliseconds + 1)
  if (!Number.isSafeInteger(jitter) || jitter < 0 || jitter > 1_000) {
    throw new Error('Account response timing jitter is invalid.')
  }

  const elapsed = (dependencies.now ?? (() => performance.now()))() - startedAtMilliseconds
  const remaining = Math.max(0, Math.ceil(minimumMilliseconds + jitter - elapsed))
  if (remaining > 0) {
    await (dependencies.sleep ?? defaultSleep)(remaining)
  }
}
