# React Native integration

This guide shows the contract between Relay and a React Native app. The examples
use the reserved documentation host `oberoi.links.relay.example`; replace it with
the workspace's real managed or custom hostname.

## Two kinds of URL

The mobile team may already provide custom-scheme destinations:

```text
oberoi://home
oberoi://offer
oberoi://rewards-detail?SlabName=Gold&SlabPromo=10OFF
oberoi://brand-details?Brand_Id=123
```

These URLs describe screens inside the installed app. They are not the campaign
links sent to customers.

Relay creates durable HTTPS links:

```text
https://oberoi.links.relay.example/l/mall/home
https://oberoi.links.relay.example/l/mall/gold-reward
```

iOS Universal Links and Android App Links open the app directly when the released
app trusts that hostname. If the app cannot open, Relay shows an allowlisted web
or store fallback.

## Register the app

Ask the mobile team for:

| Relay field          | Mobile-team value                        | Example                          |
| -------------------- | ---------------------------------------- | -------------------------------- |
| Native scheme        | React Native linking scheme              | `oberoi`                         |
| iOS Bundle ID        | Xcode target bundle identifier           | `com.oberoi.mall`                |
| Apple Team ID        | Apple Developer membership Team ID       | `A1B2C3D4E5`                     |
| Android package      | Android `applicationId`                  | `com.oberoi.mall`                |
| SHA-256 fingerprint  | Play App Signing certificate fingerprint | `AA:BB:…`                        |
| Store URLs           | Public App Store and Play Store listings | Official store URLs              |
| Default web fallback | Customer-owned HTTPS page                | `https://www.oberoimall.com/app` |

Apple Team ID, Bundle ID, Android package, and SHA-256 certificate fingerprints
are public association identifiers. Relay does **not** need Apple private keys,
Android keystores, signing passwords, or store-account credentials.

## Import destinations

Paste a custom-scheme URL into Relay's native URL field:

```text
oberoi://rewards-detail?SlabName=Gold&SlabPromo=10OFF
```

Relay previews and saves:

```text
Destination path: /rewards-detail
Parameter SlabName: Gold
Parameter SlabPromo: 10OFF
```

The scheme must match the app configuration. URL fragments, credentials,
non-scalar parameters, oversized values, and dangerous protocols are rejected.

## Resolve the campaign URL before navigation

The operating system delivers the public campaign path, for example
`/l/mall/gold-reward`. It does **not** rewrite that path to the saved
`/rewards-detail` destination. The app must resolve the campaign slug against the
same Relay hostname, validate the returned public projection, and then hand the
destination to React Navigation.

A small integration can follow this shape:

```ts
import { Linking } from 'react-native'

const relayHosts = new Set(['oberoi.links.relay.example'])

async function toNavigationURL(incoming: string): Promise<string> {
  const url = new URL(incoming)
  if (url.protocol !== 'https:' || !relayHosts.has(url.hostname)) return incoming

  const match = /^\/l\/([a-z0-9-]+)\/([a-z0-9-]+)$/.exec(url.pathname)
  if (!match) return incoming

  const endpoint = new URL(
    `/api/public/links/${encodeURIComponent(match[1])}/${encodeURIComponent(match[2])}`,
    url.origin,
  )
  const response = await fetch(endpoint)
  if (!response.ok) throw new Error('This Relay link is unavailable.')

  const resolution: unknown = await response.json()
  // Parse `resolution` with your runtime schema before reading it.
  const link = (
    resolution as {
      link: { destinationPath: string; parameters?: Record<string, unknown> }
    }
  ).link
  if (!/^\/[A-Za-z0-9/_-]+$/.test(link.destinationPath)) {
    throw new Error('Relay returned an unsupported app route.')
  }

  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(link.parameters ?? {})) {
    if (typeof value === 'string') query.set(key, value)
  }
  const suffix = query.size ? `?${query.toString()}` : ''
  return `oberoi://${link.destinationPath.slice(1)}${suffix}`
}

const linking = {
  prefixes: ['oberoi://', 'https://oberoi.links.relay.example'],
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
        path: 'rewards-detail',
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
navigation, it can send a best-effort acknowledgement to the same Relay origin:

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
applinks:oberoi.links.relay.example
```

Relay publishes:

```text
https://oberoi.links.relay.example/.well-known/apple-app-site-association
```

The response identifies the configured `TEAM_ID.BUNDLE_ID` and allowed Relay
paths. Serve it over HTTPS without a redirect and with JSON content type.

## Android association

Add an auto-verified HTTPS intent filter for the exact hostname:

```xml
<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data
    android:host="oberoi.links.relay.example"
    android:pathPrefix="/l/mall/"
    android:scheme="https" />
</intent-filter>
```

Relay publishes:

```text
https://oberoi.links.relay.example/.well-known/assetlinks.json
```

Use the Play App Signing SHA-256 certificate, including separate fingerprints
when production and internal builds are signed differently.

## Test before sharing

1. Save the Relay link and open Test Lab.
2. Run resolution, fallback, AASA, and Asset Links checks.
3. Download or scan the QR code.
4. Test a release-signed build on physical iOS and Android devices.
5. Test installed and not-installed behavior.
6. Test paused, expired, unknown, and offline behavior.
7. Confirm the fallback never leaves the app-owned hostname allowlist.

Association files can prove configuration, but only a released app on a physical
device can confirm that the intended screen actually opened.
