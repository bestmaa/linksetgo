import { describe, expect, it } from 'vitest'

import { getLinksetGoEdition, requireCloudEdition } from '../../src/lib/server/deployment-edition'
import { isLegacyPublicHostAllowed } from '../../src/lib/server/resolve-public-host'

describe('Relay deployment edition', () => {
  it('fails closed to Community mode when configuration is missing or unknown', () => {
    expect(getLinksetGoEdition(undefined)).toBe('community')
    expect(getLinksetGoEdition('enterprise')).toBe('community')
  })

  it('enables Cloud-only operations explicitly', () => {
    expect(getLinksetGoEdition(' CLOUD ')).toBe('cloud')
    expect(() => requireCloudEdition('cloud')).not.toThrow()
    expect(() => requireCloudEdition('community')).toThrow(/Cloud mode/)
  })

  it('keeps the unscoped legacy public host out of multi-tenant Cloud', () => {
    expect(isLegacyPublicHostAllowed('community')).toBe(true)
    expect(isLegacyPublicHostAllowed('cloud')).toBe(false)
  })
})
