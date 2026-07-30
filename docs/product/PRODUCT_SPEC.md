# LinksetGo product contract

Status: implementation baseline for the Community release and managed Cloud beta.

LinksetGo is an open-source deep-link control plane. It creates durable HTTPS links,
publishes the iOS and Android association files those links require, resolves a
saved app destination, and sends users without the app to an allowlisted web or
store fallback.

## Editions

### Community

- Self-hosted as one LinksetGo deployment plus PostgreSQL.
- No application, link, resolution, member, or retention quotas imposed by LinksetGo.
- Includes apps, links, safe fallbacks, QR handoff, Test Lab, AASA, and Android
  Asset Links.
- Operators own upgrades, backups, email delivery, TLS, monitoring, and abuse
  controls.
- The dashboard identifies itself as **Community Edition** and may show a
  non-blocking sponsor link.

### Cloud

- Multi-tenant LinksetGo deployment operated by the LinksetGo service.
- Each organization owns one or more workspaces.
- Free workspaces use one operator-owned shared hostname with isolated
  `/{publicAppKey}/{linkSlug}` paths; signup does not provision a subdomain.
- Paid workspaces may add a LinksetGo-managed hostname or one verified custom domain.
- Plans limit creation and analytics retention; an exhausted quota does not
  immediately break links that customers have already shared.
- Paid plans define member and custom-domain entitlements. Managed backups are a
  hosted-service launch contract, not a capability supplied by this repository;
  Cloud must not advertise a backup SLA until its off-host provider and restore
  runbook are operating.

Public Cloud signup is controlled by an explicit production feature flag and must
remain closed until email verification, cross-tenant security tests, rate limiting,
abuse reporting, restore drills, and verified fallback ownership are operational.

## Permanent public URL contract

Free shared URL:

```text
https://{SHARED_LINK_HOST}/{publicAppKey}/{linkSlug}
```

Production-style example:

```text
https://go.linksetgo.com/sample-app-7f40d80fef6a0a97b37ad36c/offer
```

Paid managed and custom domains use the host-scoped path:

```text
https://links.example.com/l/sample-app/offer
```

On the shared hostname, globally unique `publicAppKey` selects the app and tenant.
Public quick setup derives this key from a readable scheme prefix plus a stable,
secret-keyed workspace suffix. A customer-supplied native scheme such as `paypal`
or `oberoi` never receives the exact global `/paypal/...` or `/oberoi/...` namespace
and is not promoted into the public app display name. Existing exact aliases remain
routable, while assigning a new exact alias is reserved for an explicit platform
administrator and verified-brand workflow.
On a custom or managed hostname, the hostname selects the workspace and `appKey`
selects the app within it. Both keys become permanent after publication.
`linkSlug` is permanent within the app. If a paid domain is unavailable, the
shared clean URL remains the service fallback.

Existing single-host URLs remain valid while installations migrate. Legacy
aliases remain available in Community for old globally unique app keys, but all
Cloud public traffic requires a workspace-mapped managed or custom hostname.
Cloud never serves unscoped association files from the installation's legacy
base URL.

## Native destination contract

A mobile team can provide either a destination path and parameters separately or
paste its custom-scheme URL:

```text
sampleapp://membership-detail?level=Gold&promo=10OFF
```

LinksetGo stores the public, scheme-independent route:

```text
path: /membership-detail
parameters:
  level: Gold
  promo: 10OFF
```

The mobile app owns the scheme and navigation implementation. LinksetGo never asks
for Apple private keys, Android keystores, store passwords, or signing secrets.

## App onboarding data

The customer supplies only identifiers already controlled by its mobile team:

- Simple scheme handoff: paste a custom-scheme URL. LinksetGo derives the app,
  permanent shared key, destination and link slug; fallback and store URLs are optional.
- Verified App Links: app name, permanent app key, description and native scheme.
- iOS Bundle ID, Apple Team ID, and App Store URL when iOS is enabled.
- Android package name, Play signing SHA-256 certificate fingerprints, and Play
  Store URL when Android is enabled.
- App-owned fallback hostnames. Cloud activation additionally requires ownership
  verification.

A simple scheme-handoff app can become active immediately because the HTTPS landing
page performs the custom-scheme handoff. A verified-App-Links app starts as `draft`
and becomes `active` only when at least one configured platform is complete and the
operator explicitly activates it.

## Beta plan catalog

The plan catalog is versioned and enforced by server-side policy, never only by
the dashboard.

| Plan       |          Price | Workspaces |      Apps | Saved links | Active links | Monthly tracked resolutions |           Analytics |   Members |      Custom domains |
| ---------- | -------------: | ---------: | --------: | ----------: | -----------: | --------------------------: | ------------------: | --------: | ------------------: |
| Community  | $0 self-hosted |  Unlimited | Unlimited |   Unlimited |    Unlimited |                   Unlimited | Operator controlled | Unlimited | Operator controlled |
| Cloud Free |             $0 |          1 |         1 |          25 |           10 |                       1,000 |              7 days |         1 |                   0 |
| Starter    |       $5/month |          5 |         5 |       2,500 |        2,500 |                     150,000 |             90 days |         3 |                   1 |
| Pro        |      $10/month |         20 |        20 |      10,000 |       10,000 |                   1,000,000 |            365 days |        10 |                   5 |

These are beta limits. Before paid launch they must be checked against measured
database, bandwidth, backup, email, abuse-handling, and support costs.

At 80% usage the dashboard warns the workspace. At 100% it blocks new resources
for that metric and offers an upgrade. Existing active links continue to resolve
through a billing grace period unless the workspace is suspended for abuse.
Saved-link usage includes draft, active, paused, and expired records; the active
link limit is enforced separately for the currently resolvable subset.

## Domain lifecycle

Custom domains use the following explicit states:

```text
pending-dns -> verifying -> certificate-ready -> association-incomplete -> active
```

Activation requires:

1. Exact normalized hostname registration.
2. DNS TXT ownership challenge.
3. CNAME validation to the managed ingress.
4. TLS readiness.
5. Host-scoped AASA and Asset Links validation.
6. Customer confirmation that released mobile builds include the hostname.

Resolver and association routes exact-match a verified domain to one workspace.
They never publish another tenant's app identifiers and never trust arbitrary
forwarded host headers.

## Required product journeys

1. Public visitor reads the product, pricing, documentation, security, and
   open-source pages.
2. Cloud user verifies email, creates an organization and workspace, and receives
   a managed hostname.
3. User registers an app with guided platform-specific fields.
4. User pastes a native route or enters a destination and parameters.
5. LinksetGo creates a link, shows its public URL and QR code, and opens Test Lab.
6. Test Lab checks resolution, fallback, AASA, and Asset Links for each platform.
7. Owners invite members, inspect plan usage, and manage billing.
8. Pro owners verify and activate a custom domain without breaking shared links.
9. Community operators install, upgrade, back up, restore, and monitor LinksetGo from
   published documentation.

## Release gates

Every release must pass architecture checks, formatting, lint, strict typecheck,
integration tests, a clean-database migration test, production build, container
smoke test, and desktop/mobile Chrome QA. Cloud release additionally requires a
two-tenant authorization matrix, forged-host tests, concurrent quota tests,
idempotent billing webhook tests, and rate-limit/abuse tests.
