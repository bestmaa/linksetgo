import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { AbuseCaseEvents } from './collections/AbuseCaseEvents'
import { AbuseCases } from './collections/AbuseCases'
import { AbuseReports } from './collections/AbuseReports'
import { Apps } from './collections/Apps'
import { BillingEvents } from './collections/BillingEvents'
import { DeepLinks } from './collections/DeepLinks'
import { Domains } from './collections/Domains'
import { EnforcementEvents } from './collections/EnforcementEvents'
import { FallbackOrigins } from './collections/FallbackOrigins'
import { LinkEvents } from './collections/LinkEvents'
import { OrganizationMemberships } from './collections/OrganizationMemberships'
import { OrganizationInvitations } from './collections/OrganizationInvitations'
import { Organizations } from './collections/Organizations'
import { Subscriptions } from './collections/Subscriptions'
import { UsageCounters } from './collections/UsageCounters'
import { Users } from './collections/Users'
import { VerificationRuns } from './collections/VerificationRuns'
import { Workspaces } from './collections/Workspaces'
import { getServerEnvironment } from './lib/server/env'
import { getApplicationSiteURL } from './lib/server/site-url'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)
const environment = getServerEnvironment()
const applicationOrigin = getApplicationSiteURL().origin
const isProduction = process.env.NODE_ENV === 'production'

export default buildConfig({
  admin: {
    importMap: {
      baseDir: path.resolve(dirname),
    },
    user: Users.slug,
  },
  collections: [
    Users,
    Organizations,
    Workspaces,
    Domains,
    FallbackOrigins,
    OrganizationInvitations,
    OrganizationMemberships,
    Subscriptions,
    BillingEvents,
    UsageCounters,
    Apps,
    DeepLinks,
    AbuseReports,
    AbuseCases,
    EnforcementEvents,
    AbuseCaseEvents,
    LinkEvents,
    VerificationRuns,
  ],
  cors: [applicationOrigin],
  csrf: [applicationOrigin],
  db: postgresAdapter({
    disableCreateDatabase: isProduction,
    pool: {
      connectionString: environment.databaseURL,
    },
    push: !isProduction,
  }),
  defaultDepth: 1,
  editor: lexicalEditor(),
  graphQL: {
    disable: true,
  },
  maxDepth: 4,
  routes: {
    admin: '/cms',
  },
  secret: environment.payloadSecret,
  serverURL: applicationOrigin,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  telemetry: false,
  sharp,
  plugins: [],
})
