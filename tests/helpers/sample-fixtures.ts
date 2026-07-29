export type SeedAdminCredentials = Readonly<{
  email: string
  password: string
}>

export const seededApp = {
  androidPackageName: 'com.example.sampleapp',
  appleAppID: 'DEMO123456.com.example.sampleapp',
  name: 'Sample App',
  nativeScheme: 'sampleapp',
  pathPattern: '/l/sample-app/*',
  slug: 'sample-app',
} as const

export const seededLink = {
  destinationPath: '/offers/welcome',
  name: 'Welcome offer',
  slug: 'welcome-offer',
} as const

function requiredEnvironment(name: 'SEED_ADMIN_EMAIL' | 'SEED_ADMIN_PASSWORD'): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(
      `${name} is required. Run npm run seed after configuring the local environment.`,
    )
  }
  return value
}

export function getSeedAdminCredentials(): SeedAdminCredentials {
  return {
    email: requiredEnvironment('SEED_ADMIN_EMAIL').toLowerCase(),
    password: requiredEnvironment('SEED_ADMIN_PASSWORD'),
  }
}
