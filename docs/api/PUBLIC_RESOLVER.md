# Public resolver API

LinksetGo exposes a narrow, unauthenticated JSON projection for app clients and its
fallback page. Private collection APIs remain authenticated.

## Resolve a link

```http
GET /api/public/links/{appKey}/{linkSlug}
Host: example.linksetgo.example
```

The request hostname is part of the tenant key. LinksetGo exact-matches it to an active
workspace domain before looking up the app and link. Unknown hosts fail closed and
never fall back to another workspace.

Resolver and association `GET` responses allow credential-free cross-origin
reads so the Cloud console can inspect a workspace hostname. They never allow
credentialed CORS, and mutation/authentication APIs remain same-origin.

Successful response:

```json
{
  "status": "active",
  "publicUrl": "https://example.linksetgo.example/l/sample-app/welcome-offer",
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

Only scalar link parameters are public. LinksetGo accepts at most 20 entries, safe
1–64-character keys, 512-character string values, and a 4 KB combined size.
Nested values and oversized legacy data are not projected.

## Mobile handoff contract

iOS and Android deliver the public `/l/{appKey}/{linkSlug}` URL to the installed
app. They do not transform that campaign slug into `destinationPath`. The mobile
client must call this resolver on the same exact origin, validate the response,
allowlist the returned screen and parameter names, and then navigate. If the
request is offline, unavailable, malformed, or targets an unrecognized screen, the
app must show a safe error state instead of guessing a route.

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
  "linkSlug": "welcome-offer",
  "eventType": "store-clicked",
  "sessionID": "opaque-browser-session"
}
```

The body is limited to 4 KB. Slugs are canonical and bounded. LinksetGo uses a
secret-keyed HMAC for deduplication and does not store raw client IP addresses or
new raw user-agent strings in application event data. A `202` acknowledges
ingestion. The mobile app may send `app-opened` only after it accepts the resolved
route and hands it to navigation. This endpoint is unauthenticated and therefore
spoofable: public events remain approximate and are not proof that a native screen
opened.

Cloud deployments still require edge/CDN rate limiting before requests reach
PostgreSQL.

## Cache and compatibility

Resolver responses use `Cache-Control: no-store` because status, expiry, fallback
and subscription state can change. A legacy Community hostname continues to serve
the original `/l/{app}/{link}` path; workspace and custom domains use the same path
with host-scoped lookup.
