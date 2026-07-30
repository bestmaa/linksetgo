import { describe, expect, it, vi } from 'vitest'

import { buildPublicAppLookupWhere, tenantIsRoutable } from '@/lib/server/resolve-public-link'

describe('shared public resolver scope', () => {
  it('uses the globally unique public key for clean shared links', () => {
    expect(
      buildPublicAppLookupWhere({
        appKey: 'oberoi',
        pathStyle: 'shared-clean',
      }),
    ).toEqual({ publicKey: { equals: 'oberoi' } })
  })

  it('preserves workspace-scoped app slugs on managed and custom hosts', () => {
    expect(
      buildPublicAppLookupWhere({
        appKey: 'oberoi',
        pathStyle: 'host-scoped',
        workspaceID: '42',
      }),
    ).toEqual({
      and: [{ slug: { equals: 'oberoi' } }, { workspace: { equals: 42 } }],
    })
  })

  it('preserves the Community legacy slug lookup', () => {
    expect(
      buildPublicAppLookupWhere({
        appKey: 'legacy-app',
        pathStyle: 'host-scoped',
      }),
    ).toEqual({ slug: { equals: 'legacy-app' } })
  })

  it('allows a missing workspace only on the legacy host-scoped path', async () => {
    const payload = { findByID: vi.fn() } as unknown as Parameters<typeof tenantIsRoutable>[0]

    await expect(tenantIsRoutable(payload, null, 'host-scoped')).resolves.toBe(true)
    await expect(tenantIsRoutable(payload, null, 'shared-clean')).resolves.toBe(false)
    expect(payload.findByID).not.toHaveBeenCalled()
  })

  it('requires an active workspace and organization for shared clean links', async () => {
    const findByID = vi.fn(async (input: { collection: string }) =>
      input.collection === 'workspaces'
        ? { organization: 9, platformSuspended: false, status: 'active' }
        : { platformSuspended: false, status: 'active' },
    )
    const payload = { findByID } as unknown as Parameters<typeof tenantIsRoutable>[0]

    await expect(tenantIsRoutable(payload, 42, 'shared-clean')).resolves.toBe(true)
    expect(findByID).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ collection: 'workspaces', id: 42 }),
    )
    expect(findByID).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ collection: 'organizations', id: 9 }),
    )
  })

  it('fails closed for suspended or missing shared-link tenants', async () => {
    const suspendedWorkspace = {
      findByID: vi.fn(async () => ({
        organization: 9,
        platformSuspended: false,
        status: 'suspended',
      })),
    } as unknown as Parameters<typeof tenantIsRoutable>[0]
    const missingWorkspace = {
      findByID: vi.fn(async () => {
        throw new Error('not found')
      }),
    } as unknown as Parameters<typeof tenantIsRoutable>[0]
    const suspendedOrganization = {
      findByID: vi.fn(async (input: { collection: string }) =>
        input.collection === 'workspaces'
          ? { organization: 9, platformSuspended: false, status: 'active' }
          : { platformSuspended: true, status: 'active' },
      ),
    } as unknown as Parameters<typeof tenantIsRoutable>[0]

    await expect(tenantIsRoutable(suspendedWorkspace, 42, 'shared-clean')).resolves.toBe(false)
    await expect(tenantIsRoutable(missingWorkspace, 42, 'shared-clean')).resolves.toBe(false)
    await expect(tenantIsRoutable(suspendedOrganization, 42, 'shared-clean')).resolves.toBe(false)
  })
})
