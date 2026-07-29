# Self-host LinksetGo Community

LinksetGo Community runs as one Next.js/Payload application and one PostgreSQL
database. The included Compose stack builds the app from source, waits for
PostgreSQL, applies committed migrations in a one-shot container, and starts the
non-root application container only after migrations succeed.

## Requirements

- A Linux host with Docker Engine and Docker Compose v2
- 2 CPU cores and 2 GB RAM for a small installation
- A DNS name and HTTPS reverse proxy for internet-facing links
- OpenSSL for the setup helper

## Start a new installation

```bash
git clone https://github.com/bestmaa/linksetgo.git
cd linksetgo
RELAY_PUBLIC_URL=https://links.example.com \
RELAY_SOURCE_URL=https://github.com/bestmaa/linksetgo \
  ./scripts/setup-community.sh
```

The helper creates `.env.community` with mode `600`, generates independent
database, Payload, and event-hashing secrets, validates the Compose model, builds
both images, runs the migration service, and starts LinksetGo. It never prints the
generated secrets. The published application port binds to `127.0.0.1` by
default, so a reverse proxy on the same host can reach LinksetGo without exposing the
container port directly to the network.

For an HTTPS installation the helper requires `RELAY_SOURCE_URL`. It stores that
exact credential-free HTTPS repository or archive as `SOURCE_CODE_URL` and LinksetGo
links to it from the public open-source page. Keep it pinned to source that
corresponds to the deployed build, including your modifications. Local loopback
evaluation may leave it empty.

On the first installation only, keep the public proxy disabled (or temporarily
deny `/cms/create-first-user`), visit that route through localhost or an SSH
tunnel, and create the first owner. Payload promotes that user to LinksetGo super
admin. Confirm the bootstrap route is no longer available before enabling public
traffic. After that, use `/admin/login` for normal operation and keep all of
`/cms` restricted to trusted operators.

To use a different host port:

```bash
RELAY_PORT=8080 RELAY_PUBLIC_URL=https://links.example.com \
  RELAY_SOURCE_URL=https://github.com/bestmaa/linksetgo \
  ./scripts/setup-community.sh
```

To publish the application port beyond loopback, set an explicit bind address
only after host firewall and ingress controls are ready:

```bash
RELAY_BIND_ADDRESS=0.0.0.0 RELAY_PUBLIC_URL=https://links.example.com \
  RELAY_SOURCE_URL=https://github.com/bestmaa/linksetgo \
  ./scripts/setup-community.sh
```

The setup script is safe to rerun. It preserves an existing `.env.community` and
named database volume. When that file already exists, edit its public origins,
port, or bind address deliberately; command-line values do not rewrite saved
configuration.

`RELAY_EDITION=community` is explicit in every generated installation and defaults
to `community` when absent or unrecognized. Hosted-only signup, billing, and quota
paths require the exact value `cloud`, so they fail closed in self-hosted mode.
Community uses one unified application hostname: opening `/` enters the console,
and an unauthenticated visitor continues to `/admin/login`. The same hostname
also serves `/l/...`, AASA and Asset Links.

`SPONSOR_URL` is optional and empty by default. Set it only to a trusted external
HTTPS donation page; when it is blank or invalid, LinksetGo keeps sponsorship disabled
instead of guessing an account.

## Reverse proxy contract

Terminate TLS at a reverse proxy or CDN and forward requests to port `3100` (or
the configured `RELAY_PORT`). Preserve the original `Host` header. The canonical
runtime and marketing origins must use the external HTTPS origin:

```dotenv
PUBLIC_LINK_BASE_URL=https://links.example.com
NEXT_PUBLIC_SITE_URL=https://links.example.com
```

`NEXT_PUBLIC_SITE_URL` supplies build-time marketing metadata, so rebuild LinksetGo
after changing it. `PUBLIC_LINK_BASE_URL`, database credentials, and server
secrets are runtime values. Console-generated URLs use the selected workspace's
active domain through the authenticated runtime-config endpoint; they do not use a
build-time tenant domain. `NEXT_PUBLIC_APP_URL` is only an optional local
Playwright target.

The proxy should:

- redirect HTTP to HTTPS;
- preserve `/.well-known/apple-app-site-association` and
  `/.well-known/assetlinks.json` without an extra redirect;
- set request-body and request-rate limits;
- use a real client IP only for proxy controls, without forwarding or logging it
  unnecessarily in LinksetGo;
- limit `/cms` by VPN, SSO-aware proxy, or IP allowlist;
- preserve LinksetGo's Content Security Policy unless a replacement has been tested
  against both the LinksetGo console and Payload emergency CMS.

LinksetGo sets a conservative Content Security Policy plus HSTS, frame,
MIME-sniffing, referrer, permissions, and DNS-prefetch headers in production.
The proxy remains responsible for TLS policy and request limits.

## Health checks

- `GET /api/health/live` checks that the HTTP process is alive.
- `GET /api/health/ready` verifies that Payload can query PostgreSQL.

Both responses are non-cacheable and disclose no credentials or database errors.
Use readiness for load-balancer traffic and liveness only for process replacement.

## Analytics retention

Setting `ANALYTICS_RETENTION_DAYS` defines Community retention, but configuration
alone does not delete data. Preview and then execute the bounded maintenance job:

```bash
docker compose --env-file .env.community run --rm migrate \
  npm run analytics:prune
docker compose --env-file .env.community run --rm migrate \
  npm run analytics:prune -- --execute
```

Schedule the execute form daily only after reviewing the dry-run output and
backup policy. Cloud derives each organization cutoff from its plan instead of
the Community environment value. See
[analytics retention operations](./operations/ANALYTICS_RETENTION.md).

Monitor the byte size and status of both mobile trust files. LinksetGo paginates all
active apps and fails closed rather than publishing a partial or oversized file;
see [association-file capacity](./operations/ASSOCIATION_CAPACITY.md).

## Upgrade

1. Read the release notes and take a verified backup.
2. Pull the desired signed tag or commit.
3. Run `./scripts/setup-community.sh`.
4. Confirm `docker compose --env-file .env.community ps`.
5. Test one link, both association files, admin login, and Test Lab.

The migration container exits non-zero on failure, so Compose does not replace the
working app with an unmigrated release. Do not run `npm run migrate` against a
development database that was previously created with Payload schema push unless
its migration state has first been reconciled and backed up.

## Stop and remove

```bash
docker compose --env-file .env.community stop
```

`docker compose down` removes containers and networks but preserves the named
database volume. Never add `--volumes` unless permanent database deletion is
explicitly intended and a restore has been tested.

## Operational minimum

Before public traffic, configure daily off-host backups, restore drills,
certificate-expiry monitoring, uptime checks against readiness and a real link,
PostgreSQL disk alerts, and CDN/WAF rate limits. LinksetGo's in-database event
deduplication is not an abuse-grade edge limiter.
