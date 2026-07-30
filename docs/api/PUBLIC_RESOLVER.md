# Public resolver API

LinksetGo exposes a narrow, unauthenticated JSON projection for app clients and its
fallback page. Private collection APIs remain authenticated.

## Resolve a link

```http
GET /api/public/links/{appKey}/{linkSlug}
Host: example.linksetgo.example
```

The clean shared page is:

```text
https://go.linksetgo.com/{publicAppKey}/{linkSlug}
```

On the exact shared hostname, LinksetGo resolves the globally unique
`publicAppKey`. On a paid managed or custom hostname, the request hostname is
part of the tenant key and `appKey` is scoped to that workspace. Unknown hosts
and ambiguous keys fail closed and never fall back to another workspace. A
shared clean key is routable only when its app belongs to an active,
non-suspended workspace whose organization is also active and non-suspended.
Only the legacy host-scoped Community resolver retains compatibility with apps
whose workspace relationship has not yet been backfilled.

Quick setup always assigns a tenant-scoped key such as
`sample-app-7f40d80fef6a0a97b37ad36c`; it never grants an unverified native scheme
as the exact global key. Existing and explicitly platform-administered aliases
remain compatible. Shared resolver pages emit `noindex, nofollow, noarchive`,
and the shared hostname's `robots.txt` disallows crawling every path.

Resolver and association `GET` responses allow credential-free cross-origin
reads so the Cloud console can inspect a workspace hostname. They never allow
credentialed CORS, and mutation/authentication APIs remain same-origin.

Successful response:

```json
{
  "status": "active",
  "eventToken": "v1.<server-minted-claims>.<signature>",
  "publicUrl": "https://go.linksetgo.com/sample-app-7f40d80fef6a0a97b37ad36c/welcome-offer",
  "app": {
    "name": "Example App",
    "slug": "sample-app",
    "appStoreUrl": "https://apps.apple.com/app/id123456789",
    "playStoreUrl": "https://play.google.com/store/apps/details?id=com.example.sampleapp",
    "fallbackUrl": "https://www.example.com/app"
  },
  "link": {
    "name": "Gold reward",
    "slug": "welcome-offer",
    "destinationPath": "/membership-detail",
    "parameters": {
      "level": "Gold",
      "promo": "10OFF"
    },
    "fallbackUrl": null,
    "status": "active",
    "expiresAt": null
  }
}
```

`eventToken` is a signed, 10-minute capability bound to the exact app, link,
request hostname, and a server-minted nonce. Keep it only long enough to report
the interactions for this resolution. It is not an account credential and
cannot be reused for another app, link, or hostname.

Only scalar link parameters are public. LinksetGo accepts at most 20 entries, safe
1–64-character keys, 512-character string values, and a 4 KB combined size.
Nested values and oversized legacy data are not projected.

## Mobile handoff contract

In simple scheme-handoff mode, the shared HTTPS landing page resolves the record
and attempts the stored custom-scheme destination. If the app does not open, the
page offers configured store links, an exact verified-and-safe fallback URL, or
the neutral LinksetGo landing state.

In verified-App-Links mode, iOS and Android deliver the host-scoped
`/l/{appKey}/{linkSlug}` URL to the installed app. The app calls this resolver on
the same origin, validates the response, allowlists the returned screen and
parameter names, and then navigates. An offline, unavailable, malformed, or
unrecognized route must produce a safe error state instead of a guessed route.

## Unavailable responses

Malformed slugs return `400`, unknown resources return `404`, and inactive or
expired resources return `410`.

```json
{
  "status": "unavailable",
  "error": {
    "code": "LINK_EXPIRED",
    "message": "This deep link has expired."
  }
}
```

Clients must treat error messages as display text and branch on the documented
code. They must not infer whether a resource exists across another hostname.

## Public event acknowledgement

The LinksetGo fallback page can submit one of:

```text
fallback-viewed
open-app-clicked
store-clicked
app-opened
```

```http
POST /api/public/link-events
Content-Type: application/json
```

```json
{
  "appSlug": "mall",
  "eventToken": "v1.<server-minted-claims>.<signature>",
  "linkSlug": "welcome-offer",
  "eventType": "store-clicked"
}
```

The body is limited to 4 KB. Slugs are canonical and bounded, and a valid
resolver-issued token is required. Caller-provided session IDs are not event
authority and do not affect identity, deduplication, or quota.

PostgreSQL atomically enforces these initial guardrails across all replicas:

- resolver requests: 30 per trusted client per minute;
- resolver requests for the same client and public link: 10 per minute;
- resolver requests for one public link: 600 per minute;
- event submissions: 30 per trusted client per minute;
- event submissions for one link and event type: 600 per minute;
- per signed token: one `fallback-viewed`, up to two
  `open-app-clicked`, up to two `store-clicked`, and one `app-opened`;
- resolved analytics: one stable client/link event per 15 seconds.

Only a request admitted by these controls may consume monthly resolution quota
or create analytics data. Once a finite plan reaches its monthly cap, public
resolution remains available but detailed analytics stop, and further requests
do not mutate the capped usage-counter row.

Client identity is a secret-keyed hash of the canonical client IP supplied by a
trusted ingress. LinksetGo never stores the raw IP. It does not trust raw
forwarding headers, user-agent strings, or caller session IDs as identity. When
`TRUST_PROXY_CLIENT_IP_HEADER` is disabled, the event boundary deliberately
uses one shared anonymous bucket; configure the trusted ingress contract before
production traffic.

A `202` acknowledges the submission but does not promise it produced an
analytics row. The mobile app may send `app-opened` only after it accepts the
resolved route and hands it to navigation. Public events remain approximate and
are not proof that a native screen opened. Edge/CDN bot controls remain required
as defense in depth before requests reach PostgreSQL.

## Cache and compatibility

Resolver responses use `Cache-Control: no-store` because status, expiry, fallback,
safety and subscription state can change. The Cloud shared hostname serves clean
`/{publicAppKey}/{linkSlug}` pages. Legacy Community, workspace, managed and custom
hosts continue to use `/l/{app}/{link}` with host-scoped lookup.
