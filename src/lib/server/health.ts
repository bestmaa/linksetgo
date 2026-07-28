export type HealthResult =
  | {
      status: 'ok'
      checks: { database: 'ok' }
    }
  | {
      status: 'unavailable'
      checks: { database: 'unavailable' }
    }

const withTimeout = async (check: () => Promise<void>, timeoutMs: number): Promise<void> => {
  let timer: ReturnType<typeof setTimeout> | undefined

  try {
    await Promise.race([
      check(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Readiness check timed out.')), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export const evaluateReadiness = async (
  check: () => Promise<void>,
  timeoutMs = 2_500,
): Promise<HealthResult> => {
  try {
    await withTimeout(check, timeoutMs)
    return { status: 'ok', checks: { database: 'ok' } }
  } catch {
    return { status: 'unavailable', checks: { database: 'unavailable' } }
  }
}
