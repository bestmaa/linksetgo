import type { App } from '@/payload-types'

export type AppleAssociation = {
  applinks: {
    apps: []
    details: Array<{
      appID: string
      components: Array<{
        '/': string
        comment: string
      }>
    }>
  }
}

export type AndroidAssociation = Array<{
  relation: ['delegate_permission/common.handle_all_urls']
  target: {
    namespace: 'android_app'
    package_name: string
    sha256_cert_fingerprints: string[]
  }
}>

const activeApps = (apps: readonly App[]): App[] =>
  apps.filter((app) => app.status === 'active').sort((a, b) => a.slug.localeCompare(b.slug))

export const buildAppleAssociation = (apps: readonly App[]): AppleAssociation => ({
  applinks: {
    apps: [],
    details: activeApps(apps)
      .filter((app) => Boolean(app.iosTeamId && app.iosBundleId))
      .map((app) => ({
        appID: `${app.iosTeamId}.${app.iosBundleId}`,
        components: [
          {
            '/': `/l/${app.slug}/*`,
            comment: `Deep links for ${app.name}`,
          },
        ],
      })),
  },
})

export const buildAndroidAssociation = (apps: readonly App[]): AndroidAssociation =>
  activeApps(apps)
    .filter(
      (app) =>
        Boolean(app.androidPackageName) && Boolean(app.androidSha256CertFingerprints?.length),
    )
    .map((app) => ({
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: app.androidPackageName as string,
        sha256_cert_fingerprints: [
          ...new Set(
            (app.androidSha256CertFingerprints ?? []).map((fingerprint) =>
              fingerprint.toUpperCase(),
            ),
          ),
        ],
      },
    }))
