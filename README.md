# Relay

Relay is a self-service deep-link operations console built with Payload 3, Next.js,
React, TypeScript, and PostgreSQL. Teams register an app once, create managed links,
copy or scan the generated shared URL, and verify the public resolver plus the iOS
and Android association files from one app-like admin interface.

## Community quick start

Relay Community is self-hostable under the
[GNU Affero General Public License v3 or later](./LICENSE). A new Docker Compose
installation needs Docker Compose v2 and OpenSSL:

```bash
git clone <your-fork-or-release-url> relay
cd relay
RELAY_PUBLIC_URL=https://links.example.com \
RELAY_SOURCE_URL=https://github.com/your-org/relay \
  ./scripts/setup-community.sh
```

For local-only evaluation, omit `RELAY_PUBLIC_URL` and open
`http://127.0.0.1:3100`. On a new database, create the first owner at
`/cms/create-first-user`, then use `/admin/login`.

Internet-facing AGPL installations must set `RELAY_SOURCE_URL` to the exact
public repository or archive containing the Corresponding Source for the deployed
version. Relay exposes it as `SOURCE_CODE_URL` on the public open-source page.

The portable stack includes private PostgreSQL networking, a one-shot migration
service, a non-root/read-only application container, generated secrets, and
liveness/readiness probes. See [self-hosting](./docs/self-hosting.md) and
[backup/restore operations](./docs/backups.md) before exposing it to the internet.
The Compose port binds to loopback by default; bootstrap the first owner before a
public proxy is enabled.

## Local URLs

- Relay admin: `http://127.0.0.1:3100/admin`
- Payload emergency CMS: `http://127.0.0.1:3100/cms` (super-admin only)
- Seeded link: `http://127.0.0.1:3100/l/relay-demo/welcome-offer`
- Apple association: `http://127.0.0.1:3100/.well-known/apple-app-site-association`
- Android association: `http://127.0.0.1:3100/.well-known/assetlinks.json`

Local admin credentials are generated or configured in `.env`. That file is ignored
by Git and restricted to the current WSL user.

## Contributor setup with shared PostgreSQL

Requirements: WSL, Docker, Node.js 22, npm, and OpenSSL.

```bash
cd /home/beste/project/daynmic-deeplinking
./scripts/setup-local.sh
npm run dev
```

The setup is safe to rerun. It starts the shared PostgreSQL service, provisions
isolated development and test roles/databases, installs dependencies, repairs weak
local secrets, and idempotently seeds an admin, sample app, and sample link.

If Windows localhost forwarding is disabled, open the WSL IP returned by
`hostname -I` and start development with that host in
`RELAY_ALLOWED_DEV_ORIGIN`. This option is development-only and should contain one
trusted hostname.

## Shared PostgreSQL

PostgreSQL is deliberately outside this repository:

```text
/home/beste/project/_shared/postgres
```

One long-running `shared-postgres` container stores every local project's database in
the external `shared-postgres-data` Docker volume. Projects receive separate,
non-superuser roles and databases.

```bash
cd /home/beste/project/_shared/postgres
./scripts/bootstrap.sh
./scripts/create-project-db.sh another_project_dev another_project_app
./scripts/check-project-db.sh another_project_dev another_project_app
./scripts/backup-db.sh dynamic_deeplinking_dev
```

Generated connection details live under `credentials/` with mode `600`. The service
binds only to `127.0.0.1:5432`; containers on the external `shared-services` network
can use the hostname `shared-postgres`.

Do not run `docker compose down --volumes` against shared infrastructure. App
repositories should not own or delete the shared volume.

## Product flow

1. Sign in to `/admin`.
2. Add an app and its iOS/Android identity plus HTTPS store/fallback URLs.
3. Add a deep link with a route such as `/offers/welcome`.
4. Share the generated `/l/{appSlug}/{linkSlug}` URL or its QR code.
5. Use Test Lab to validate the resolver, Apple AASA record, Android Asset Links
   record, and fallback behavior.

Public resolver responses expose only the safe app/link projection. Draft, paused,
expired, malformed, or unknown links return a typed unavailable response. Fallback
hosts are allowlisted per app to prevent open redirects. Analytics are recorded only
through an explicit POST, with salted session hashes, short deduplication, and a
per-session application limit. Add CDN/WAF throttling before an internet-facing
deployment because database-level counting is not an abuse-grade rate limiter.

## React architecture

Interactive features follow this boundary:

```text
route -> connector -> custom hook -> typed props -> pure view
```

- Route files mount connectors.
- Connectors call one custom controller hook and pass props.
- Hooks own fetching, state, navigation, and side effects.
- `*.view.tsx` files render props only.
- Every React/TSX file must stay at or below 250 physical lines.

Run `npm run check:architecture` to enforce the view boundary and line limit.

## Database migrations

Development uses Payload's schema push. Production schema changes must use committed
migrations:

```bash
npm run migrate:status
npm run migrate
npm run migrate:create -- descriptive-change-name
```

Set the production environment before running migrations. Run `npm run migrate`
before starting a production release.

## Commands

```bash
npm run dev                 # local server on 3100
npm run seed                # idempotent local sample data
npm run analytics:prune     # preview analytics retention deletion
npm run lint
npm run typecheck
npm run test:int
npm run test:e2e
npm run build
npm run verify              # architecture, lint, types, integration, build
```

The E2E suite targets desktop Chromium. On platforms unsupported by Playwright's
bundled browser, run it in supported CI and perform the local workflow in an
installed Chrome.

## React Native and production contract

Relay can generate the web records, but the mobile apps still must opt into the
shared HTTPS domain:

- iOS: add the Associated Domains entitlement
  `applinks:links.your-company.example`, use the matching Team ID and Bundle ID, and
  route `/l/{appSlug}/*` inside the app.
- Android: add an App Link intent filter for the HTTPS host/path, enable
  `android:autoVerify`, use the matching package name and signing certificate
  SHA-256 fingerprint, and route the same path inside React Native.

Production requires a real HTTPS domain with no redirect on either `/.well-known`
file. Confirm behavior on physical iOS and Android devices in installed,
not-installed, paused, expired, and offline cases. Replace all local URLs and secrets,
configure backups/monitoring, put a proxy/CDN in front of the app, and keep Payload's
`/cms` route restricted.

## App container

The `Dockerfile` provides separate `migrator` and `runner` targets. The runner is a
small standalone Next.js image that executes as an unprivileged user. Public
build-time metadata and labels can be set with `NEXT_PUBLIC_SITE_URL`,
`NEXT_PUBLIC_APP_ENV`, and `NEXT_PUBLIC_DATABASE_LABEL` build args. Generated
workspace links load their active managed/custom origin from the authenticated
runtime API; a tenant domain is never baked into the image. Provide `DATABASE_URL`,
`PAYLOAD_SECRET`, `EVENT_HASH_SECRET`, and `PUBLIC_LINK_BASE_URL` only at runtime.
The builder placeholders are deliberately unusable, and the build sanitizer
removes every `.env*` file from standalone output before the runner is assembled.

## Contributing and security

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before submitting a change and report
vulnerabilities through the private process in [SECURITY.md](./SECURITY.md).
Participation is governed by [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
Community help is described in [SUPPORT.md](./SUPPORT.md), project decisions in
[GOVERNANCE.md](./GOVERNANCE.md), and release-facing changes in
[CHANGELOG.md](./CHANGELOG.md).

Operators should also read the
[analytics retention](./docs/operations/ANALYTICS_RETENTION.md) and
[team invitation delivery](./docs/operations/TEAM_INVITATIONS.md) contracts.

The optional `SPONSOR_URL` setting enables a trusted external sponsorship action
without hardcoding a payment account. It is disabled by default.

The Community v0.1 license and the provisional Relay name/brand still require final
owner legal and trademark approval before a public launch. The software license
does not grant rights to project names, logos, or service marks; see
[TRADEMARKS.md](./TRADEMARKS.md).
