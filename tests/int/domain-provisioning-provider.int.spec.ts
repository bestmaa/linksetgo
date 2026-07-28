import { describe, expect, it } from 'vitest'

import { DisabledDomainProvisioningProvider } from '../../src/lib/application/domain-provisioning-provider'

describe('Community domain provisioning provider', () => {
  it('does not pretend DNS or certificate automation exists', async () => {
    const provider = new DisabledDomainProvisioningProvider()

    await expect(provider.inspectDNS('links.example.com')).resolves.toMatchObject({
      kind: 'disabled',
    })
    await expect(provider.requestCertificate('links.example.com')).resolves.toMatchObject({
      kind: 'disabled',
    })
  })
})
