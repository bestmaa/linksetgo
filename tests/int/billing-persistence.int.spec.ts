import { REST_POST } from '@payloadcms/next/routes'
import { TextEncoder as NodeTextEncoder } from 'node:util'
import { InMemoryRateLimitProvider } from '@/lib/application/rate-limit-provider'
import { buildFallbackOriginInstructions } from '@/lib/domain/fallback-origin'
import config from '@/payload.config'
import type { App, Organization, Subscription, User, Workspace } from '@/payload-types'
import type { BillingProvider } from '@/lib/application/billing-provider'
import { PLAN_CATALOG_VERSION, planCatalog } from '@/lib/domain/plan-catalog'
import type { SubscriptionEvent } from '@/lib/domain/subscription-state'
import { processBillingWebhook } from '@/lib/server/billing-webhook'
import {
  createBillingWebhookHandler,
  MAX_BILLING_WEBHOOK_BYTES,
} from '@/lib/server/billing-webhook-handler'
import { resolveOrganizationPlan } from '@/lib/server/billing-plan'
import { getBillingSummary } from '@/lib/server/billing-summary'
import { createOrganizationCheckout } from '@/lib/server/billing-checkout'
import {
  beginFallbackOriginVerification,
  verifyFallbackOriginWithProvider,
} from '@/lib/server/fallback-origin-lifecycle'
import { MEMBERSHIP_OWNER_OVERRIDE_CONTEXT } from '@/lib/server/membership-owner-guards'
import {
  canRecordDetailedAnalytics,
  meterResolvedApp,
  monthlyUsagePeriodStart,
} from '@/lib/server/resolution-metering'
import { admitResolvedLinkEvent } from '@/lib/server/link-event-rate-limit'
import { linkEventResourceKey } from '@/lib/server/link-event-token'
import { recordLinkEvent } from '@/lib/server/record-link-event'
import { resolvePublicLink } from '@/lib/server/resolve-public-link'
import { ensureFreeSubscriptionForOrganization } from '@/lib/server/subscription-bootstrap'
import { createLocalReq, getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const FIXTURE = {
  organizations: ['billing-free', 'billing-starter', 'billing-pro'],
  users: [
    'billing-platform@linksetgo.test',
    'billing-free@linksetgo.test',
    'billing-starter@linksetgo.test',
    'billing-pro@linksetgo.test',
    'billing-invitee@linksetgo.test',
  ],
} as const

type Tenant = {
  organization: Organization
  subscription: Subscription
  user: User
  workspace: Workspace
}

const assertTestDatabase = (): void => {
  const value = process.env.DATABASE_URL
  if (!value || !decodeURIComponent(new URL(value).pathname).endsWith('_test')) {
    throw new Error('Billing integration tests require the disposable _test database.')
  }
}

const disabledSession = async () =>
  ({
    kind: 'disabled',
    message: 'Not configured in this test.',
  }) as const

const providerFor = (getEvent: () => SubscriptionEvent): BillingProvider => ({
  createCheckoutSession: disabledSession,
  createCustomerPortalSession: disabledSession,
  verifyAndParseWebhook: async () => ({ kind: 'success', value: getEvent() }),
})

describe.sequential('Cloud billing persistence and quota enforcement', () => {
  let payload: Payload
  let platformUser: User
  let free: Tenant
  let starter: Tenant
  let pro: Tenant
  let freeApp: App
  const previousEdition = process.env.RELAY_EDITION

  const cleanup = async (): Promise<void> => {
    const organizations = await payload.find({
      collection: 'organizations',
      depth: 0,
      limit: 10,
      overrideAccess: true,
      pagination: false,
      where: { slug: { in: [...FIXTURE.organizations] } },
    })
    const organizationIDs = organizations.docs.map(({ id }) => id)
    if (organizationIDs.length > 0) {
      const workspaces = await payload.find({
        collection: 'workspaces',
        depth: 0,
        limit: 20,
        overrideAccess: true,
        pagination: false,
        where: { organization: { in: organizationIDs } },
      })
      const workspaceIDs = workspaces.docs.map(({ id }) => id)
      const apps =
        workspaceIDs.length === 0
          ? { docs: [] }
          : await payload.find({
              collection: 'apps',
              depth: 0,
              limit: 100,
              overrideAccess: true,
              pagination: false,
              where: { workspace: { in: workspaceIDs } },
            })
      const appIDs = apps.docs.map(({ id }) => id)
      if (appIDs.length > 0) {
        const links = await payload.find({
          collection: 'deep-links',
          depth: 0,
          limit: 1_000,
          overrideAccess: true,
          pagination: false,
          where: { app: { in: appIDs } },
        })
        const linkIDs = links.docs.map(({ id }) => id)
        if (linkIDs.length > 0) {
          await payload.delete({
            collection: 'link-events',
            overrideAccess: true,
            where: { link: { in: linkIDs } },
          })
        }
        await payload.delete({
          collection: 'deep-links',
          overrideAccess: true,
          where: { app: { in: appIDs } },
        })
      }
      if (workspaceIDs.length > 0) {
        await payload.delete({
          collection: 'fallback-origins',
          overrideAccess: true,
          where: { workspace: { in: workspaceIDs } },
        })
        await payload.delete({
          collection: 'domains',
          overrideAccess: true,
          where: { workspace: { in: workspaceIDs } },
        })
        await payload.delete({
          collection: 'apps',
          overrideAccess: true,
          where: { workspace: { in: workspaceIDs } },
        })
      }
      await payload.delete({
        collection: 'billing-events',
        overrideAccess: true,
        where: { organization: { in: organizationIDs } },
      })
      await payload.delete({
        collection: 'usage-counters',
        overrideAccess: true,
        where: { organization: { in: organizationIDs } },
      })
      await payload.delete({
        collection: 'subscriptions',
        overrideAccess: true,
        where: { organization: { in: organizationIDs } },
      })
      await payload.delete({
        collection: 'organization-memberships',
        context: { [MEMBERSHIP_OWNER_OVERRIDE_CONTEXT]: true },
        overrideAccess: true,
        where: { organization: { in: organizationIDs } },
      })
      await payload.delete({
        collection: 'workspaces',
        overrideAccess: true,
        where: { organization: { in: organizationIDs } },
      })
      await payload.delete({
        collection: 'organizations',
        overrideAccess: true,
        where: { id: { in: organizationIDs } },
      })
    }
    await payload.delete({
      collection: 'users',
      overrideAccess: true,
      where: { email: { in: [...FIXTURE.users] } },
    })
  }

  const createTenant = async (
    slug: (typeof FIXTURE.organizations)[number],
    email: (typeof FIXTURE.users)[number],
    plan: 'free' | 'pro' | 'starter',
  ): Promise<Tenant> => {
    const user = await payload.create({
      collection: 'users',
      data: {
        email,
        name: `${plan} owner`,
        password: 'BillingOwnerPassword123!',
        role: 'admin',
        status: 'active',
      },
      overrideAccess: true,
    })
    const organization = await payload.create({
      collection: 'organizations',
      data: { name: `${plan} organization`, slug, status: 'active' },
      overrideAccess: true,
    })
    const workspace = await payload.create({
      collection: 'workspaces',
      data: {
        name: `${plan} workspace`,
        organization: organization.id,
        slug: `${slug}-workspace`,
        status: 'active',
      },
      overrideAccess: true,
    })
    await payload.create({
      collection: 'organization-memberships',
      data: {
        organization: organization.id,
        role: 'owner',
        status: 'active',
        user: user.id,
      },
      overrideAccess: true,
    })

    const hostname = `${slug}.example`
    const origin = await payload.create({
      collection: 'fallback-origins',
      data: {
        hostname,
        status: 'pending',
        verificationToken: `billing-${slug}-fallback-verification-token`,
        workspace: workspace.id,
      },
      depth: 0,
      overrideAccess: false,
      user: platformUser,
    })
    const req = await createLocalReq({ user: platformUser }, payload)
    const begun = await beginFallbackOriginVerification({
      id: origin.id,
      payload,
      req,
    })
    if (!begun.ok) throw new Error('Could not begin fallback-origin verification.')
    const instructions = buildFallbackOriginInstructions(origin)
    if (!instructions) throw new Error('Fallback-origin instructions were invalid.')
    const verified = await verifyFallbackOriginWithProvider({
      id: origin.id,
      payload,
      provider: {
        lookupTXT: async () => ({
          observedAt: new Date().toISOString(),
          values: [instructions.value],
        }),
      },
      req,
    })
    if (!verified.ok) throw new Error('Could not verify fallback-origin fixture.')

    const subscription =
      plan === 'free'
        ? await ensureFreeSubscriptionForOrganization(payload, organization.id)
        : await payload.create({
            collection: 'subscriptions',
            data: {
              catalogVersion: PLAN_CATALOG_VERSION,
              lastEventAt: '2026-01-01T00:00:00.000Z',
              lastProviderEventID: `initialized:${slug}`,
              organization: organization.id,
              plan,
              provider: 'test-provider',
              providerSubscriptionID: `sub_${slug}`,
              status: 'active',
            },
            depth: 0,
            overrideAccess: true,
          })
    return { organization, subscription, user, workspace }
  }

  beforeAll(async () => {
    assertTestDatabase()
    process.env.RELAY_EDITION = 'cloud'
    payload = await getPayload({ config: await config })
    await cleanup()
    platformUser = await payload.create({
      collection: 'users',
      data: {
        email: FIXTURE.users[0],
        name: 'Billing platform admin',
        password: 'BillingPlatformPassword123!',
        role: 'super-admin',
        status: 'active',
      },
      overrideAccess: true,
    })
    free = await createTenant(FIXTURE.organizations[0], FIXTURE.users[1], 'free')
    starter = await createTenant(FIXTURE.organizations[1], FIXTURE.users[2], 'starter')
    pro = await createTenant(FIXTURE.organizations[2], FIXTURE.users[3], 'pro')
  }, 60_000)

  afterAll(async () => {
    if (!payload) {
      process.env.RELAY_EDITION = previousEdition
      return
    }
    try {
      await cleanup()
    } finally {
      process.env.RELAY_EDITION = previousEdition
      await payload.destroy()
    }
  }, 60_000)

  it('resolves Community, Free, Starter, and Pro from server-owned state', async () => {
    await expect(resolveOrganizationPlan(payload, free.organization.id)).resolves.toMatchObject({
      plan: {
        key: 'free',
        limits: {
          apps: 1,
          monthlyResolutions: 1_000,
          savedLinks: 25,
          workspaces: 1,
        },
      },
      source: 'subscription',
    })
    await expect(resolveOrganizationPlan(payload, starter.organization.id)).resolves.toMatchObject({
      plan: { key: 'starter', limits: { apps: 5, monthlyResolutions: 150_000 } },
    })
    await expect(resolveOrganizationPlan(payload, pro.organization.id)).resolves.toMatchObject({
      plan: { key: 'pro', limits: { apps: 20, monthlyResolutions: 1_000_000 } },
    })
    await expect(
      resolveOrganizationPlan(payload, free.organization.id, { edition: 'community' }),
    ).resolves.toMatchObject({
      plan: { key: 'community', limits: { apps: 'unlimited' } },
      source: 'community',
    })
  })

  it('blocks Free workspace creation after the first saved workspace', async () => {
    await expect(
      payload.create({
        collection: 'workspaces',
        data: {
          name: 'Blocked second Free workspace',
          organization: free.organization.id,
          slug: 'billing-free-second-workspace',
          status: 'active',
        },
        overrideAccess: true,
      }),
    ).rejects.toMatchObject({ status: 402 })
  })

  it('fails closed when the HTTP webhook is disabled and rejects oversized raw bodies', async () => {
    const disabled = createBillingWebhookHandler({
      getConfiguration: () => ({
        configured: false,
        key: 'disabled',
        provider: providerFor(() => {
          throw new Error('Disabled provider must not be called.')
        }),
      }),
    })
    await expect(
      disabled(new Request('http://127.0.0.1/api/billing/webhook', { body: 'x', method: 'POST' })),
    ).resolves.toMatchObject({ status: 503 })

    let verificationCalls = 0
    const provider = providerFor(() => {
      verificationCalls += 1
      throw new Error('Oversized bodies must not reach verification.')
    })
    const bounded = createBillingWebhookHandler({
      getConfiguration: () => ({ configured: true, key: 'test', provider }),
      getPayload: async () => payload,
    })
    const response = await bounded(
      new Request('http://127.0.0.1/api/billing/webhook', {
        body: 'not-read',
        headers: { 'content-length': String(MAX_BILLING_WEBHOOK_BYTES + 1) },
        method: 'POST',
      }),
    )
    expect(response.status).toBe(413)
    expect(verificationCalls).toBe(0)
  })

  it('creates a provider checkout without granting entitlement on return', async () => {
    let checkoutOrganizationID: string | null = null
    const provider: BillingProvider = {
      ...providerFor(() => {
        throw new Error('Checkout must not invoke a webhook.')
      }),
      createCheckoutSession: async (request) => {
        checkoutOrganizationID = request.organizationID
        return {
          kind: 'success',
          value: {
            expiresAt: '2026-07-27T12:00:00.000Z',
            url: 'https://checkout.provider.test/session_123',
          },
        }
      },
    }
    const before = await payload.findByID({
      collection: 'subscriptions',
      id: starter.subscription.id,
      depth: 0,
      overrideAccess: true,
    })
    await expect(
      createOrganizationCheckout({
        appBaseURL: 'https://app.linksetgo.test',
        payload,
        plan: 'pro',
        provider,
        user: starter.user,
        workspaceID: String(starter.workspace.id),
      }),
    ).resolves.toMatchObject({
      kind: 'success',
      url: 'https://checkout.provider.test/session_123',
    })
    expect(checkoutOrganizationID).toBe(String(starter.organization.id))
    const after = await payload.findByID({
      collection: 'subscriptions',
      id: starter.subscription.id,
      depth: 0,
      overrideAccess: true,
    })
    expect(after).toMatchObject({
      lastProviderEventID: before.lastProviderEventID,
      plan: before.plan,
      providerSubscriptionID: before.providerSubscriptionID,
      status: before.status,
    })
  })

  it('serializes concurrent REST creates so the Free app limit cannot race', async () => {
    const browserEncoder = globalThis.TextEncoder
    const browserBytes = globalThis.Uint8Array
    const nodeBytes = new NodeTextEncoder().encode('').constructor
    globalThis.TextEncoder = NodeTextEncoder as typeof TextEncoder
    globalThis.Uint8Array = nodeBytes as typeof Uint8Array
    const login = await payload.login({
      collection: 'users',
      data: { email: free.user.email, password: 'BillingOwnerPassword123!' },
    })
    if (!login.token) throw new Error('REST quota test could not authenticate.')

    const post = REST_POST(config)
    const create = (slug: string) =>
      post(
        new Request('http://127.0.0.1:3100/api/apps', {
          body: JSON.stringify({
            fallbackUrl: 'https://billing-free.example/app',
            iosBundleId: 'com.example.billingfree',
            iosTeamId: 'A1B2C3D4E5',
            name: slug,
            nativeScheme: slug,
            slug,
            status: 'active',
            workspace: free.workspace.id,
          }),
          headers: {
            authorization: `JWT ${login.token}`,
            'content-type': 'application/json',
          },
          method: 'POST',
        }),
        { params: Promise.resolve({ slug: ['apps'] }) },
      )

    const responses = await Promise.all([
      create('billing-free-race-a'),
      create('billing-free-race-b'),
    ])
    globalThis.TextEncoder = browserEncoder
    globalThis.Uint8Array = browserBytes
    expect(responses.map(({ status }) => status).sort()).toEqual([201, 402])

    const apps = await payload.find({
      collection: 'apps',
      depth: 0,
      limit: 2,
      overrideAccess: true,
      pagination: false,
      where: { workspace: { equals: free.workspace.id } },
    })
    expect(apps.docs).toHaveLength(1)
    freeApp = apps.docs[0]!
  }, 30_000)

  it('enforces member/link limits and keeps link identity permanent', async () => {
    const invitee = await payload.create({
      collection: 'users',
      data: {
        email: FIXTURE.users[4],
        name: 'Billing invitee',
        password: 'BillingInviteePassword123!',
        role: 'viewer',
        status: 'active',
      },
      overrideAccess: true,
    })
    const membership = await payload.create({
      collection: 'organization-memberships',
      data: {
        organization: free.organization.id,
        role: 'member',
        status: 'disabled',
        user: invitee.id,
      },
      overrideAccess: true,
    })
    await expect(
      payload.update({
        collection: 'organization-memberships',
        id: membership.id,
        data: { status: 'active' },
        overrideAccess: true,
      }),
    ).rejects.toMatchObject({ status: 402 })

    for (let index = 0; index < planCatalog.free.limits.activeLinks; index += 1) {
      await payload.create({
        collection: 'deep-links',
        data: {
          app: freeApp.id,
          destinationPath: `/quota/${index}`,
          name: `Free link ${index}`,
          slug: `billing-free-link-${index}`,
          status: 'active',
        },
        overrideAccess: true,
      })
    }
    await expect(
      payload.create({
        collection: 'deep-links',
        data: {
          app: freeApp.id,
          destinationPath: '/quota/blocked',
          name: 'Blocked free link',
          slug: 'billing-free-link-blocked',
          status: 'active',
        },
        overrideAccess: true,
      }),
    ).rejects.toMatchObject({ status: 402 })

    await expect(
      payload.create({
        collection: 'deep-links',
        data: {
          app: freeApp.id,
          destinationPath: '/quota/expired',
          expiresAt: '2020-01-01T00:00:00.000Z',
          name: 'Expired free link',
          slug: 'billing-free-link-expired',
          status: 'active',
        },
        overrideAccess: true,
      }),
    ).resolves.toBeTruthy()

    const existingSavedLinks = planCatalog.free.limits.activeLinks + 1
    for (
      let index = existingSavedLinks;
      index < planCatalog.free.limits.savedLinks - 1;
      index += 1
    ) {
      await payload.create({
        collection: 'deep-links',
        data: {
          app: freeApp.id,
          destinationPath: `/saved-quota/${index}`,
          name: `Free saved link ${index}`,
          slug: `billing-free-saved-link-${index}`,
          status: 'draft',
        },
        overrideAccess: true,
      })
    }
    const savedLinkRace = await Promise.all(
      ['a', 'b'].map(async (suffix) => {
        try {
          await payload.create({
            collection: 'deep-links',
            data: {
              app: freeApp.id,
              destinationPath: `/saved-quota/race-${suffix}`,
              name: `Racing saved Free link ${suffix}`,
              slug: `billing-free-saved-link-race-${suffix}`,
              status: 'draft',
            },
            overrideAccess: true,
          })
          return 201
        } catch (error: unknown) {
          expect(error).toMatchObject({ status: 402 })
          return 402
        }
      }),
    )
    expect(savedLinkRace.sort()).toEqual([201, 402])

    const starterApp = await payload.create({
      collection: 'apps',
      data: {
        fallbackUrl: 'https://billing-starter.example/app',
        iosBundleId: 'com.example.billingstarter',
        iosTeamId: 'A1B2C3D4E5',
        name: 'Starter source app',
        slug: 'billing-starter-source',
        status: 'active',
        workspace: starter.workspace.id,
      },
      overrideAccess: true,
    })
    const movable = await payload.create({
      collection: 'deep-links',
      data: {
        app: starterApp.id,
        destinationPath: '/move',
        name: 'Cross-organization move',
        slug: 'billing-movable-link',
        status: 'active',
      },
      overrideAccess: true,
    })
    await expect(
      payload.update({
        collection: 'deep-links',
        id: movable.id,
        data: { app: freeApp.id },
        overrideAccess: true,
      }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      payload.update({
        collection: 'deep-links',
        id: movable.id,
        data: { slug: 'billing-moved-key' },
        overrideAccess: true,
      }),
    ).rejects.toMatchObject({ status: 400 })

    const draftApp = await payload.create({
      collection: 'apps',
      data: {
        fallbackUrl: 'https://billing-starter.example/draft',
        name: 'Starter draft app',
        slug: 'billing-starter-draft',
        status: 'draft',
        workspace: starter.workspace.id,
      },
      overrideAccess: true,
    })
    const draftLink = await payload.create({
      collection: 'deep-links',
      data: {
        app: draftApp.id,
        destinationPath: '/draft',
        name: 'Draft link for draft app',
        slug: 'billing-draft-app-link',
        status: 'draft',
      },
      overrideAccess: true,
    })
    expect(draftLink.status).toBe('draft')
    await expect(
      payload.update({
        collection: 'deep-links',
        id: draftLink.id,
        data: { status: 'active' },
        overrideAccess: true,
      }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      payload.create({
        collection: 'deep-links',
        data: {
          app: draftApp.id,
          destinationPath: '/active',
          name: 'Active link for draft app',
          slug: 'billing-draft-app-active-link',
          status: 'active',
        },
        overrideAccess: true,
      }),
    ).rejects.toMatchObject({ status: 400 })
  }, 60_000)

  it('permits one Starter custom domain and five on Pro', async () => {
    await expect(
      payload.create({
        collection: 'domains',
        data: {
          hostname: 'billing-starter-custom.example.net',
          status: 'pending-dns',
          type: 'custom',
          verificationToken: 'billing-starter-domain-verification-token',
          workspace: starter.workspace.id,
        },
        overrideAccess: true,
      }),
    ).resolves.toBeTruthy()

    await expect(
      payload.create({
        collection: 'domains',
        data: {
          hostname: 'billing-starter-second.example.net',
          status: 'pending-dns',
          type: 'custom',
          verificationToken: 'billing-starter-second-verification-token',
          workspace: starter.workspace.id,
        },
        overrideAccess: true,
      }),
    ).rejects.toMatchObject({ status: 402 })

    for (let index = 0; index < planCatalog.pro.limits.customDomains; index += 1) {
      await expect(
        payload.create({
          collection: 'domains',
          data: {
            hostname: `billing-pro-${index}.example.net`,
            status: 'pending-dns',
            type: 'custom',
            verificationToken: `billing-pro-domain-verification-token-${index}`,
            workspace: pro.workspace.id,
          },
          overrideAccess: true,
        }),
      ).resolves.toBeTruthy()
    }
    await expect(
      payload.create({
        collection: 'domains',
        data: {
          hostname: 'billing-pro-blocked.example.net',
          status: 'pending-dns',
          type: 'custom',
          verificationToken: 'billing-pro-blocked-verification-token',
          workspace: pro.workspace.id,
        },
        overrideAccess: true,
      }),
    ).rejects.toMatchObject({ status: 402 })
  })

  it('binds the first verified paid event to its checkout organization and rejects forgery', async () => {
    await payload.update({
      collection: 'subscriptions',
      id: pro.subscription.id,
      data: {
        lastEventAt: '2026-07-01T00:00:00.000Z',
        lastProviderEventID: `relay-free-initialized:${pro.organization.id}`,
        plan: 'free',
        provider: 'relay-internal',
        providerCustomerID: null,
        providerSubscriptionID: `relay-free:${pro.organization.id}`,
        status: 'active',
      },
      depth: 0,
      overrideAccess: true,
    })
    let event: SubscriptionEvent = {
      currentPeriodEnd: '2026-09-01T00:00:00.000Z',
      eventID: 'evt_first_paid_binding',
      graceEndsAt: null,
      occurredAt: '2026-07-27T07:00:00.000Z',
      organizationID: String(pro.organization.id),
      plan: 'starter',
      providerCustomerID: 'cus_verified_pro',
      providerSubscriptionID: 'sub_verified_pro',
      status: 'active',
    }
    const provider = providerFor(() => event)
    const request = {
      body: new TextEncoder().encode('verified-first-upgrade'),
      headers: { 'x-provider-signature': 'verified-in-stub' },
    }
    await expect(
      processBillingWebhook({ payload, provider, providerKey: 'test', request }),
    ).resolves.toMatchObject({ kind: 'applied', organizationID: String(pro.organization.id) })
    await expect(
      payload.findByID({
        collection: 'subscriptions',
        id: pro.subscription.id,
        depth: 0,
        overrideAccess: true,
      }),
    ).resolves.toMatchObject({
      plan: 'starter',
      provider: 'test',
      providerCustomerID: 'cus_verified_pro',
      providerSubscriptionID: 'sub_verified_pro',
    })

    event = {
      ...event,
      eventID: 'evt_forged_rebinding',
      occurredAt: '2026-07-28T07:00:00.000Z',
      organizationID: String(starter.organization.id),
      plan: 'pro',
    }
    await expect(
      processBillingWebhook({ payload, provider, providerKey: 'test', request }),
    ).resolves.toMatchObject({ kind: 'error', retryable: false })
    const forgedEvents = await payload.count({
      collection: 'billing-events',
      overrideAccess: true,
      where: { providerEventID: { equals: 'evt_forged_rebinding' } },
    })
    expect(forgedEvents.totalDocs).toBe(0)
  })

  it('reconciles concurrent replay and stale verified webhooks exactly once', async () => {
    let event: SubscriptionEvent = {
      currentPeriodEnd: '2026-09-01T00:00:00.000Z',
      eventID: 'evt_billing_concurrent',
      graceEndsAt: null,
      occurredAt: '2026-07-27T08:00:00.000Z',
      plan: 'pro',
      providerSubscriptionID: starter.subscription.providerSubscriptionID,
      status: 'active',
    }
    const provider = providerFor(() => event)
    const request = {
      body: new TextEncoder().encode('verified-provider-payload'),
      headers: { 'x-provider-signature': 'verified-in-stub' },
    }
    const concurrent = await Promise.all([
      processBillingWebhook({ payload, provider, providerKey: 'test', request }),
      processBillingWebhook({ payload, provider, providerKey: 'test', request }),
    ])
    expect(concurrent.map(({ kind }) => kind).sort()).toEqual(['applied', 'duplicate'])
    await expect(
      processBillingWebhook({ payload, provider, providerKey: 'test', request }),
    ).resolves.toMatchObject({ kind: 'duplicate' })
    const handler = createBillingWebhookHandler({
      getConfiguration: () => ({ configured: true, key: 'test', provider }),
      getPayload: async () => payload,
    })
    const handlerResponse = await handler(
      new Request('http://127.0.0.1/api/billing/webhook', {
        body: 'verified-provider-payload',
        headers: { 'x-provider-signature': 'verified-in-stub' },
        method: 'POST',
      }),
    )
    expect(handlerResponse.status).toBe(200)
    await expect(handlerResponse.json()).resolves.toMatchObject({
      outcome: 'duplicate',
      status: 'accepted',
    })

    event = {
      ...event,
      eventID: 'evt_billing_stale',
      occurredAt: '2026-07-01T08:00:00.000Z',
      plan: 'free',
      status: 'canceled',
    }
    await expect(
      processBillingWebhook({ payload, provider, providerKey: 'test', request }),
    ).resolves.toMatchObject({ kind: 'stale' })

    const events = await payload.find({
      collection: 'billing-events',
      depth: 0,
      limit: 10,
      overrideAccess: true,
      pagination: false,
      where: { organization: { equals: starter.organization.id } },
    })
    expect(events.docs).toHaveLength(2)
    expect(events.docs.map(({ outcome }) => outcome).sort()).toEqual(['applied', 'stale'])
    const subscription = await payload.findByID({
      collection: 'subscriptions',
      id: starter.subscription.id,
      depth: 0,
      overrideAccess: true,
    })
    expect(subscription).toMatchObject({
      lastProviderEventID: 'evt_billing_concurrent',
      plan: 'pro',
      status: 'active',
    })
  }, 30_000)

  it('keeps metering resolution after ordinary payment failure', async () => {
    await payload.update({
      collection: 'subscriptions',
      id: free.subscription.id,
      data: {
        graceEndsAt: '2020-01-02T00:00:00.000Z',
        status: 'past-due',
      },
      overrideAccess: true,
    })
    const resolution = await resolveOrganizationPlan(payload, free.organization.id, {
      now: new Date('2026-07-27T10:00:00.000Z'),
    })
    expect(resolution.access).toMatchObject({ canCreate: false, canResolve: true })

    const now = new Date('2026-07-27T10:00:00.000Z')
    const eventHashSecret = process.env.EVENT_HASH_SECRET
    if (!eventHashSecret) throw new Error('EVENT_HASH_SECRET is required for event tests.')
    await Promise.all([
      meterResolvedApp(payload, freeApp.id, now),
      meterResolvedApp(payload, freeApp.id, now),
    ])
    const usage = await payload.find({
      collection: 'usage-counters',
      depth: 0,
      limit: 2,
      overrideAccess: true,
      pagination: false,
      where: {
        and: [
          { organization: { equals: free.organization.id } },
          { periodStart: { equals: monthlyUsagePeriodStart(now) } },
        ],
      },
    })
    expect(usage.docs).toHaveLength(1)
    expect(usage.docs[0]?.count).toBe(2)

    const resolverLinks = await payload.find({
      collection: 'deep-links',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      where: {
        and: [{ app: { equals: freeApp.id } }, { status: { equals: 'active' } }],
      },
    })
    const resolverLink = resolverLinks.docs[0]
    if (!resolverLink) throw new Error('Expected a resolver event link fixture.')
    const resolverEventsBefore = await payload.count({
      collection: 'link-events',
      overrideAccess: true,
      where: { link: { equals: resolverLink.id } },
    })
    const resolverProvider = new InMemoryRateLimitProvider(() => now.getTime())
    const resolverAdmissions = await Promise.all([
      admitResolvedLinkEvent({
        clientKey: 'a'.repeat(64),
        eventHashSecret,
        provider: resolverProvider,
        resourceKey: linkEventResourceKey(freeApp.id, resolverLink.id, eventHashSecret),
      }),
      admitResolvedLinkEvent({
        clientKey: 'a'.repeat(64),
        eventHashSecret,
        provider: resolverProvider,
        resourceKey: linkEventResourceKey(freeApp.id, resolverLink.id, eventHashSecret),
      }),
    ])
    const resolverRecordings = await Promise.all(
      resolverAdmissions.map((admission) =>
        admission.allowed
          ? recordLinkEvent(
              {
                admission: admission.grant,
                appID: freeApp.id,
                linkID: resolverLink.id,
                platform: 'web',
                referrer: 'https://same-referrer.example/path',
              },
              { now: () => now },
            )
          : false,
      ),
    )
    expect(resolverRecordings.filter(Boolean)).toHaveLength(1)
    const resolverEventsAfter = await payload.count({
      collection: 'link-events',
      overrideAccess: true,
      where: { link: { equals: resolverLink.id } },
    })
    expect(resolverEventsAfter.totalDocs).toBe(resolverEventsBefore.totalDocs + 1)

    const freeResolutionLimit = planCatalog.free.limits.monthlyResolutions
    await payload.update({
      collection: 'usage-counters',
      id: usage.docs[0]!.id,
      data: { count: freeResolutionLimit - 1 },
      overrideAccess: true,
    })
    const boundaryLinks = await payload.find({
      collection: 'deep-links',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      where: {
        and: [{ app: { equals: freeApp.id } }, { status: { equals: 'active' } }],
      },
    })
    const boundaryLink = boundaryLinks.docs[0]
    if (!boundaryLink) throw new Error('Expected a boundary metering link fixture.')
    const boundaryEventsBefore = await payload.count({
      collection: 'link-events',
      overrideAccess: true,
      where: { link: { equals: boundaryLink.id } },
    })
    const boundaryAdmission = await admitResolvedLinkEvent({
      clientKey: 'b'.repeat(64),
      eventHashSecret,
      provider: resolverProvider,
      resourceKey: linkEventResourceKey(freeApp.id, boundaryLink.id, eventHashSecret),
    })
    if (!boundaryAdmission.allowed) throw new Error('Expected a boundary event admission.')
    await expect(
      recordLinkEvent(
        {
          admission: boundaryAdmission.grant,
          appID: freeApp.id,
          linkID: boundaryLink.id,
          platform: 'web',
        },
        { now: () => now },
      ),
    ).resolves.toBe(true)
    const boundaryEventsAfter = await payload.count({
      collection: 'link-events',
      overrideAccess: true,
      where: { link: { equals: boundaryLink.id } },
    })
    expect(boundaryEventsAfter.totalDocs).toBe(boundaryEventsBefore.totalDocs + 1)
    const atLimit = await payload.findByID({
      collection: 'usage-counters',
      id: usage.docs[0]!.id,
      depth: 0,
      overrideAccess: true,
    })
    expect(atLimit.count).toBe(freeResolutionLimit)
    const overage = await meterResolvedApp(payload, freeApp.id, now)
    expect(overage).toMatchObject({
      allowDetailedAnalytics: false,
      count: freeResolutionLimit + 1,
      limit: freeResolutionLimit,
    })
    const cappedBefore = await payload.findByID({
      collection: 'usage-counters',
      id: usage.docs[0]!.id,
      depth: 0,
      overrideAccess: true,
    })
    const later = new Date(now.getTime() + 60_000)
    await Promise.all(Array.from({ length: 8 }, () => meterResolvedApp(payload, freeApp.id, later)))
    const capped = await payload.findByID({
      collection: 'usage-counters',
      id: usage.docs[0]!.id,
      depth: 0,
      overrideAccess: true,
    })
    expect(capped.count).toBe(freeResolutionLimit + 1)
    expect(capped.updatedAt).toBe(cappedBefore.updatedAt)
    await expect(canRecordDetailedAnalytics(payload, freeApp.id, now)).resolves.toBe(false)

    const links = await payload.find({
      collection: 'deep-links',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      where: {
        and: [
          { app: { equals: freeApp.id } },
          { status: { equals: 'active' } },
          {
            or: [
              { expiresAt: { exists: false } },
              { expiresAt: { greater_than: '2026-07-27T10:00:00.000Z' } },
            ],
          },
        ],
      },
    })
    const link = links.docs[0]
    if (!link) throw new Error('Expected a metering link fixture.')
    await expect(
      resolvePublicLink({
        appSlug: freeApp.slug,
        baseURL: 'https://billing-free.example',
        linkSlug: link.slug,
        workspaceID: String(free.workspace.id),
      }),
    ).resolves.toMatchObject({ ok: true, httpStatus: 200 })
    const eventsBefore = await payload.count({
      collection: 'link-events',
      overrideAccess: true,
      where: { link: { equals: link.id } },
    })
    const cappedAdmission = await admitResolvedLinkEvent({
      clientKey: 'c'.repeat(64),
      eventHashSecret,
      provider: resolverProvider,
      resourceKey: linkEventResourceKey(freeApp.id, link.id, eventHashSecret),
    })
    if (!cappedAdmission.allowed) throw new Error('Expected a capped event admission.')
    await expect(
      recordLinkEvent(
        {
          admission: cappedAdmission.grant,
          appID: freeApp.id,
          linkID: link.id,
          platform: 'web',
        },
        { now: () => later },
      ),
    ).resolves.toBe(false)
    const eventsAfter = await payload.count({
      collection: 'link-events',
      overrideAccess: true,
      where: { link: { equals: link.id } },
    })
    expect(eventsAfter.totalDocs).toBe(eventsBefore.totalDocs)
  })

  it('scopes safe subscription and usage reads while hiding billing events and provider IDs', async () => {
    const [subscriptions, usage, platformEvents] = await Promise.all([
      payload.find({
        collection: 'subscriptions',
        overrideAccess: false,
        user: free.user,
      }),
      payload.find({
        collection: 'usage-counters',
        overrideAccess: false,
        user: free.user,
      }),
      payload.find({
        collection: 'billing-events',
        overrideAccess: false,
        user: platformUser,
      }),
    ])
    expect(subscriptions.docs).toHaveLength(1)
    const subscriptionOrganization = subscriptions.docs[0]?.organization
    expect(
      String(
        typeof subscriptionOrganization === 'object'
          ? subscriptionOrganization.id
          : subscriptionOrganization,
      ),
    ).toBe(String(free.organization.id))
    expect(subscriptions.docs[0]).not.toHaveProperty('provider')
    expect(subscriptions.docs[0]).not.toHaveProperty('providerCustomerID')
    expect(subscriptions.docs[0]).not.toHaveProperty('providerSubscriptionID')
    expect(subscriptions.docs[0]).not.toHaveProperty('lastProviderEventID')
    expect(usage.docs).toHaveLength(1)
    await expect(
      payload.find({
        collection: 'billing-events',
        overrideAccess: false,
        user: starter.user,
      }),
    ).rejects.toMatchObject({ status: 403 })
    expect(platformEvents.docs.length).toBeGreaterThanOrEqual(2)
    await expect(
      getBillingSummary(payload, free.user, String(free.workspace.id)),
    ).resolves.toMatchObject({
      plan: { key: 'free' },
      subscription: { status: 'past-due' },
    })
    await expect(
      getBillingSummary(payload, free.user, String(starter.workspace.id)),
    ).resolves.toBeNull()
  })

  it('allows workspace-local app keys and fails ambiguous legacy aliases closed', async () => {
    const slug = 'billing-reused-app-key'
    await payload.create({
      collection: 'apps',
      data: {
        fallbackUrl: 'https://billing-starter.example/reused',
        iosBundleId: 'com.example.billingstarterreused',
        iosTeamId: 'A1B2C3D4E5',
        name: 'Starter reused key',
        slug,
        status: 'active',
        workspace: starter.workspace.id,
      },
      overrideAccess: true,
    })
    await payload.create({
      collection: 'apps',
      data: {
        fallbackUrl: 'https://billing-pro.example/reused',
        iosBundleId: 'com.example.billingproreused',
        iosTeamId: 'A1B2C3D4E5',
        name: 'Pro reused key',
        slug,
        status: 'active',
        workspace: pro.workspace.id,
      },
      overrideAccess: true,
    })
    await expect(
      payload.create({
        collection: 'apps',
        data: {
          fallbackUrl: 'https://billing-pro.example/duplicate',
          iosBundleId: 'com.example.billingproduplicate',
          iosTeamId: 'A1B2C3D4E5',
          name: 'Duplicate same workspace',
          slug,
          status: 'active',
          workspace: pro.workspace.id,
        },
        overrideAccess: true,
      }),
    ).rejects.toMatchObject({ status: 409 })

    await expect(
      resolvePublicLink({
        appSlug: slug,
        baseURL: 'https://legacy.links.example',
        linkSlug: 'anything',
      }),
    ).resolves.toMatchObject({
      body: { error: { code: 'APP_NOT_FOUND' } },
      httpStatus: 404,
      ok: false,
    })
  })

  it('never applies Cloud quotas to Community edition resources', async () => {
    process.env.RELAY_EDITION = 'community'
    try {
      const created = await Promise.all(
        [0, 1, 2].map((index) =>
          payload.create({
            collection: 'apps',
            data: {
              allowedFallbackHosts: ['billing-free.example'],
              fallbackUrl: `https://billing-free.example/community-${index}`,
              iosBundleId: `com.example.billingcommunity${index}`,
              iosTeamId: 'A1B2C3D4E5',
              name: `Community app ${index}`,
              slug: `billing-community-app-${index}`,
              status: 'active',
              workspace: free.workspace.id,
            },
            overrideAccess: true,
          }),
        ),
      )
      expect(created).toHaveLength(3)
    } finally {
      process.env.RELAY_EDITION = 'cloud'
    }
  })
})
