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
import { FallbackURLSafetyAssessments } from './collections/FallbackURLSafetyAssessments'
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
import {
  CLOUD_ACCOUNT_EMAIL_OUTBOX_TASK,
  deliverCloudAccountEmailTask,
} from './lib/server/cloud-account-email-task'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)
const environment = getServerEnvironment()
const applicationOrigin = getApplicationSiteURL().origin
const isProduction = process.env.NODE_ENV === 'production'
const isContinuousIntegration = process.env.CI?.trim().toLowerCase() === 'true'

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
    FallbackURLSafetyAssessments,
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
    // CI and production both apply reviewed migrations before starting Payload.
    // Schema push remains a local-development convenience only.
    disableCreateDatabase: isProduction || isContinuousIntegration,
    pool: {
      connectionString: environment.databaseURL,
    },
    push: !isProduction && !isContinuousIntegration,
  }),
  defaultDepth: 1,
  editor: lexicalEditor(),
  graphQL: {
    disable: true,
  },
  jobs: {
    access: {
      cancel: () => false,
      queue: () => false,
      run: () => false,
    },
    deleteJobOnComplete: true,
    jobsCollectionOverrides: ({ defaultJobsCollection }) => ({
      ...defaultJobsCollection,
      access: {
        create: () => false,
        delete: () => false,
        read: () => false,
        update: () => false,
      },
    }),
    tasks: [
      {
        slug: CLOUD_ACCOUNT_EMAIL_OUTBOX_TASK,
        handler: deliverCloudAccountEmailTask,
        inputSchema: [
          {
            name: 'encryptedEnvelope',
            type: 'textarea',
            required: true,
            maxLength: 16_384,
          },
          {
            name: 'expiresAt',
            type: 'date',
            required: true,
          },
        ],
        outputSchema: [
          {
            name: 'delivered',
            type: 'checkbox',
            required: true,
          },
        ],
        retries: {
          attempts: 5,
          backoff: {
            delay: 30_000,
            type: 'exponential',
          },
        },
      },
    ],
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
