import 'dotenv/config'

import { getPayload, type Payload } from 'payload'

import config from '../src/payload.config'

const SAMPLE_APP_SLUG = 'relay-demo'
const SAMPLE_LINK_SLUG = 'welcome-offer'
const SAMPLE_APP_STORE_URL = 'https://apps.apple.com/in/app/relay-demo/id123456789'
const SAMPLE_PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.example.relaydemo'

const requiredEnvironment = (name: 'SEED_ADMIN_EMAIL' | 'SEED_ADMIN_PASSWORD'): string => {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required.`)
  return value
}

const seedAdmin = async (payload: Payload, email: string, password: string): Promise<number> => {
  const existing = await payload.find({
    collection: 'users',
    overrideAccess: true,
    limit: 1,
    pagination: false,
    where: { email: { equals: email } },
  })

  if (existing.docs[0]) {
    console.info(`Seed admin already exists: ${email}`)
    return existing.docs[0].id
  }

  const admin = await payload.create({
    collection: 'users',
    overrideAccess: true,
    data: {
      email,
      name: process.env.SEED_ADMIN_NAME?.trim() || 'Relay Administrator',
      password,
      role: 'super-admin',
      status: 'active',
    },
  })
  console.info(`Created seed admin: ${email}`)
  return admin.id
}

const seedDefaultWorkspace = async (
  payload: Payload,
): Promise<{ organizationID: number; workspaceID: number }> => {
  const organizations = await payload.find({
    collection: 'organizations',
    overrideAccess: true,
    limit: 1,
    pagination: false,
    where: { slug: { equals: 'legacy' } },
  })
  const organization =
    organizations.docs[0] ??
    (await payload.create({
      collection: 'organizations',
      overrideAccess: true,
      data: { name: 'Community organization', slug: 'legacy', status: 'active' },
    }))

  const workspaces = await payload.find({
    collection: 'workspaces',
    overrideAccess: true,
    limit: 1,
    pagination: false,
    where: { slug: { equals: 'legacy' } },
  })
  const workspace =
    workspaces.docs[0] ??
    (await payload.create({
      collection: 'workspaces',
      overrideAccess: true,
      data: {
        name: 'Community workspace',
        organization: organization.id,
        slug: 'legacy',
        status: 'active',
      },
    }))

  return { organizationID: organization.id, workspaceID: workspace.id }
}

const ensureOwnerMembership = async (
  payload: Payload,
  organizationID: number,
  userID: number,
): Promise<void> => {
  const memberships = await payload.find({
    collection: 'organization-memberships',
    overrideAccess: true,
    limit: 1,
    pagination: false,
    where: {
      and: [{ organization: { equals: organizationID } }, { user: { equals: userID } }],
    },
  })
  const membership = memberships.docs[0]
  if (membership) {
    if (membership.role !== 'owner' || membership.status !== 'active') {
      await payload.update({
        id: membership.id,
        collection: 'organization-memberships',
        overrideAccess: true,
        data: { role: 'owner', status: 'active' },
      })
    }
    return
  }

  await payload.create({
    collection: 'organization-memberships',
    overrideAccess: true,
    data: {
      organization: organizationID,
      role: 'owner',
      status: 'active',
      user: userID,
    },
  })
}

const seedSampleApp = async (payload: Payload, workspaceID: number): Promise<number> => {
  const existing = await payload.find({
    collection: 'apps',
    overrideAccess: true,
    limit: 1,
    pagination: false,
    where: { slug: { equals: SAMPLE_APP_SLUG } },
  })
  const existingApp = existing.docs[0]
  if (existingApp) {
    const missingDefaults: {
      appStoreUrl?: string
      nativeScheme?: string
      playStoreUrl?: string
      workspace?: number
    } = {}
    if (!existingApp.appStoreUrl) missingDefaults.appStoreUrl = SAMPLE_APP_STORE_URL
    if (!existingApp.nativeScheme) missingDefaults.nativeScheme = 'relaydemo'
    if (!existingApp.playStoreUrl) missingDefaults.playStoreUrl = SAMPLE_PLAY_STORE_URL
    if (!existingApp.workspace) missingDefaults.workspace = workspaceID

    if (Object.keys(missingDefaults).length > 0) {
      await payload.update({
        id: existingApp.id,
        collection: 'apps',
        overrideAccess: true,
        data: missingDefaults,
      })
    }
    console.info(`Sample app already exists: ${SAMPLE_APP_SLUG}`)
    return existingApp.id
  }

  const app = await payload.create({
    collection: 'apps',
    overrideAccess: true,
    data: {
      name: 'Relay Demo Shop',
      nativeScheme: 'relaydemo',
      slug: SAMPLE_APP_SLUG,
      description: 'Sample app for local deep-link testing.',
      status: 'active',
      iosBundleId: 'com.example.relaydemo',
      iosTeamId: 'DEMO123456',
      androidPackageName: 'com.example.relaydemo',
      androidSha256CertFingerprints: [
        'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99',
      ],
      appStoreUrl: SAMPLE_APP_STORE_URL,
      playStoreUrl: SAMPLE_PLAY_STORE_URL,
      fallbackUrl: 'https://example.com/',
      allowedFallbackHosts: ['example.com'],
      workspace: workspaceID,
    },
  })
  console.info(`Created sample app: ${SAMPLE_APP_SLUG}`)
  return app.id
}

const seedSampleLink = async (payload: Payload, appID: number): Promise<void> => {
  const existing = await payload.find({
    collection: 'deep-links',
    overrideAccess: true,
    limit: 1,
    pagination: false,
    where: {
      and: [{ app: { equals: appID } }, { slug: { equals: SAMPLE_LINK_SLUG } }],
    },
  })
  if (existing.docs.length > 0) {
    console.info(`Sample deep link already exists: ${SAMPLE_LINK_SLUG}`)
    return
  }

  await payload.create({
    collection: 'deep-links',
    overrideAccess: true,
    data: {
      name: 'Welcome offer',
      app: appID,
      slug: SAMPLE_LINK_SLUG,
      destinationPath: '/offers/welcome',
      parameters: { campaign: 'local-seed', source: 'relay-console' },
      fallbackUrl: 'https://example.com/',
      status: 'active',
    },
  })
  console.info(`Created sample deep link: ${SAMPLE_LINK_SLUG}`)
}

const main = async (): Promise<void> => {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PRODUCTION_SEED !== 'true') {
    throw new Error('Production seeding is disabled. Set ALLOW_PRODUCTION_SEED=true explicitly.')
  }

  const email = requiredEnvironment('SEED_ADMIN_EMAIL').toLowerCase()
  const password = requiredEnvironment('SEED_ADMIN_PASSWORD')
  if (password.length < 12) throw new Error('SEED_ADMIN_PASSWORD must be at least 12 characters.')

  const payload = await getPayload({ config: await config })
  try {
    const tenant = await seedDefaultWorkspace(payload)
    const adminID = await seedAdmin(payload, email, password)
    await ensureOwnerMembership(payload, tenant.organizationID, adminID)
    const appID = await seedSampleApp(payload, tenant.workspaceID)
    await seedSampleLink(payload, appID)
  } finally {
    if (payload.db.destroy) await payload.db.destroy()
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Seed failed.')
    process.exit(1)
  })
