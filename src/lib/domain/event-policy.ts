export const EVENT_DEDUPE_WINDOW_MS = 15_000
export const EVENT_RATE_WINDOW_MS = 60_000
export const EVENT_RATE_LIMIT = 30

export const shouldRecordLinkEvent = (
  duplicateCount: number,
  recentSessionCount: number,
): boolean => duplicateCount === 0 && recentSessionCount < EVENT_RATE_LIMIT
