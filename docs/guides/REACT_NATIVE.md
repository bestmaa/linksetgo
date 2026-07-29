# React Native integration

This guide shows the contract between LinksetGo and a React Native app. The examples
use the reserved documentation host `example.linksetgo.example`; replace it with
the workspace's real managed or custom hostname.

## Two kinds of URL

The mobile team may already provide custom-scheme destinations:

```text
sampleapp://home
sampleapp://offer
sampleapp://membership-detail?level=Gold&promo=10OFF
sampleapp://brand-details?Brand_Id=123
```

These URLs describe screens inside the installed app. They are not the campaign
links sent to customers.

LinksetGo creates durable HTTPS links:

```text
https://example.linksetgo.example/l/sample-app/home
https://example.linksetgo.example/l/sample-app/welcome-offer
```

iOS Universal Links and Android App Links open the app directly when the released
app trusts that hostname. If the app cannot open, LinksetGo shows an allowlisted web
or store fallback.

## Register the app

Ask the mobile team for:

| LinksetGo field      | Mobile-team value                        | Example                       |
| -------------------- | ---------------------------------------- | ----------------------------- |
| Native scheme        | React Native linking scheme              | `sampleapp`                   |
| iOS Bundle ID        | Xcode target bundle identifier           | `com.example.sampleapp`       |
| Apple Team ID        | Apple Developer membership Team ID       | `A1B2C3D4E5`                  |
| Android package      | Android `applicationId`                  | `com.example.sampleapp`       |
| SHA-256 fingerprint  | Play App Signing certificate fingerprint | `AA:BB:…`                     |
| Store URLs           | Public App Store and Play Store listings | Official store URLs           |
| Default web fallback | Customer-owned HTTPS page                | `https://www.example.com/app` |

Apple Team ID, Bundle ID, Android package, and SHA-256 certificate fingerprints
are public association identifiers. LinksetGo does **not** need Apple private keys,
Android keystores, signing passwords, or store-account credentials.

## Import destinations

Paste a custom-scheme URL into LinksetGo's native URL field:

```text
sampleapp://membership-detail?level=Gold&promo=10OFF
```

LinksetGo previews and saves:

```text
Destination path: /membership-detail
Parameter level: Gold
Parameter promo: 10OFF
```

The scheme must match the app configuration. URL fragments, credentials,
non-scalar parameters, oversized values, and dangerous protocols are rejected.

## Resolve the campaign URL before navigation

The operating system delivers the public campaign path, for example
`/l/sample-app/welcome-offer`. It does **not** rewrite that path to the saved
`/membership-detail` destination. The app must resolve the campaign slug against the
same LinksetGo hostname, validate the returned public projection, and then hand the
destination to React Navigation.

A small integration can follow this shape:

```ts
import { Linking } from 'react-native'

const linksetGoHosts = new Set(['example.linksetgo.example'])

async function toNavigationURL(incoming: string): Promise<string> {
  const url = new URL(incoming)
  if (url.protocol !== 'https:' || !linksetGoHosts.has(url.hostname)) return incoming

  const match = /^\/l\/([a-z0-9-]+)\/([a-z0-9-]+)$/.exec(url.pathname)
  if (!match) return incoming

  const endpoint = new URL(
    `/api/public/links/${encodeURIComponent(match[1])}/${encodeURIComponent(match[2])}`,
    url.origin,
  )
  const response = await fetch(endpoint)
  if (!response.ok) throw new Error('This LinksetGo link is unavailable.')

  const resolution: unknown = await response.json()
  // Parse `resolution` with your runtime schema before reading it.
  const link = (
    resolution as {
      link: { destinationPath: string; parameters?: Record<string, unknown> }
    }
  ).link
  if (!/^\/[A-Za-z0-9/_-]+$/.test(link.destinationPath)) {
    throw new Error('LinksetGo returned an unsupported app route.')
  }

  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(link.parameters ?? {})) {
    if (typeof value === 'string') query.set(key, value)
  }
  const suffix = query.size ? `?${query.toString()}` : ''
  return `sampleapp://${link.destinationPath.slice(1)}${suffix}`
}

const linking = {
  prefixes: ['sampleapp://', 'https://example.linksetgo.example'],
  async getInitialURL() {
    const incoming = await Linking.getInitialURL()
    return incoming ? toNavigationURL(incoming) : null
  },
  subscribe(listener: (url: string) => void) {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      void toNavigationURL(url)
        .then(listener)
        .catch(() => {
          // Show an unavailable-link screen; never guess a destination.
        })
    })
    return () => subscription.remove()
  },
  config: {
    screens: {
      Home: 'home',
      Offer: 'offer',
      RewardsDetail: {
        path: 'membership-detail',
      },
      BrandDetails: {
        path: 'brand-details',
      },
    },
  },
}
```

Use a real runtime validator instead of the compact type assertion shown above.
Treat paths and parameters as untrusted, allow only app-known screens/keys, and
show a safe unavailable/offline screen when resolution fails. Never guess a
destination from the campaign slug.

## Acknowledge a handled route

After the app validates the response and successfully hands the known screen to
navigation, it can send a best-effort acknowledgement to the same LinksetGo origin:

```ts
void fetch(new URL('/api/public/link-events', url.origin), {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    appSlug: match[1],
    linkSlug: match[2],
    eventType: 'app-opened',
  }),
}).catch(() => {
  // Analytics must never block app navigation.
})
```

Do not send the acknowledgement before validation or retry it in a way that delays
the user. The event endpoint is intentionally unauthenticated, so counts are
approximate and not proof that a real person opened the screen.

## iOS association

Add the exact production hostname to the app's Associated Domains entitlement:

```text
applinks:example.linksetgo.example
```

LinksetGo publishes:

```text
https://example.linksetgo.example/.well-known/apple-app-site-association
```

The response identifies the configured `TEAM_ID.BUNDLE_ID` and allowed LinksetGo
paths. Serve it over HTTPS without a redirect and with JSON content type.

## Android association

Add an auto-verified HTTPS intent filter for the exact hostname:

```xml
<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data
    android:host="example.linksetgo.example"
    android:pathPrefix="/l/sample-app/"
    android:scheme="https" />
</intent-filter>
```

LinksetGo publishes:

```text
https://example.linksetgo.example/.well-known/assetlinks.json
```

Use the Play App Signing SHA-256 certificate, including separate fingerprints
when production and internal builds are signed differently.

## Test before sharing

1. Save the LinksetGo link and open Test Lab.
2. Run resolution, fallback, AASA, and Asset Links checks.
3. Download or scan the QR code.
4. Test a release-signed build on physical iOS and Android devices.
5. Test installed and not-installed behavior.
6. Test paused, expired, unknown, and offline behavior.
7. Confirm the fallback never leaves the app-owned hostname allowlist.

Association files can prove configuration, but only a released app on a physical
device can confirm that the intended screen actually opened.
