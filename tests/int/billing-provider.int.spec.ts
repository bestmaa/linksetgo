import { describe, expect, it } from 'vitest'

import { DisabledBillingProvider } from '../../src/lib/application/billing-provider'

describe('Community billing provider', () => {
  it('fails closed without pretending a checkout was created', async () => {
    const provider = new DisabledBillingProvider()

    await expect(
      provider.createCheckoutSession({
        cancelURL: 'https://relay.example/cancel',
        customerEmail: 'owner@example.com',
        organizationID: 'org_1',
        plan: 'starter',
        successURL: 'https://relay.example/success',
      }),
    ).resolves.toEqual({
      kind: 'disabled',
      message: 'Billing is disabled for this Relay deployment.',
    })
  })
})
