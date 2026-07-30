# LinksetGo production deployment

This guide defines the production host, ingress, certificate, and deployment
contract for the managed LinksetGo service. All hostnames reach the same
Next.js/Payload `runner` container on port `3000`; the application separates
marketing, authenticated, and public-link surfaces from the normalized request
hostname.

## Host contract

| Hostname                    | Purpose                   | Expected surface                                                             |
| --------------------------- | ------------------------- | ---------------------------------------------------------------------------- |
| `linksetgo.com`             | Public product website    | Landing page, pricing, documentation, legal and security pages               |
| `www.linksetgo.com`         | Optional alias            | Permanent redirect to `https://linksetgo.com` at the edge                    |
| `app.linksetgo.com`         | Authenticated application | Signup, login, dashboard, Payload APIs and operator CMS                      |
| `go.linksetgo.com`          | Shared Free links         | `/{publicAppKey}/{linkSlug}` and the bounded public resolver APIs only       |
| `{workspace}.linksetgo.com` | Managed workspace links   | `/l/{appKey}/{linkSlug}`, association files and the bounded public APIs only |
| `links.customer.com`        | Customer custom domain    | The same public-link surface, after exact verification and activation        |
| `ingress.linksetgo.com`     | Infrastructure target     | CNAME target for verified customer domains; not a product page               |

The apex and application hosts are exact matches. A workspace hostname contains
exactly one normalized workspace label before `linksetgo.com`. Workspace and
custom-domain requests must never expose pricing, signup, admin, CMS, or general
Payload collection routes.

The `ingress` workspace label is platform-reserved, so the custom-domain CNAME
target cannot collide with a customer workspace.

The request host is part of the tenant key. Public resolution still exact-matches
an active domain record to one active workspace and organization. A wildcard DNS
record routes traffic to the service; it does not authorize a workspace or make
an unknown hostname valid.

## Runtime environment

Set these values on the production `runner`. Replace every angle-bracketed value
in the deployment system; never commit the resulting environment or paste its
secrets into logs, screenshots, issues, or support messages.

```dotenv
NODE_ENV=production
PORT=3000

DATABASE_URL=postgresql://linksetgo_app:<URL_ENCODED_DATABASE_PASSWORD>@<POSTGRES_INTERNAL_HOST>:5432/linksetgo_db
PAYLOAD_SECRET=<AT_LEAST_32_RANDOM_CHARACTERS>
EVENT_HASH_SECRET=<A_DIFFERENT_32_CHARACTER_RANDOM_SECRET>

RELAY_EDITION=cloud
PUBLIC_LINK_BASE_URL=https://app.linksetgo.com
SHARED_LINK_BASE_URL=https://go.linksetgo.com
NEXT_PUBLIC_SITE_URL=https://linksetgo.com
MARKETING_SITE_URL=https://linksetgo.com
CLOUD_APP_BASE_URL=https://app.linksetgo.com

MANAGED_LINK_ROOT_DOMAIN=linksetgo.com
MANAGED_INGRESS_CNAME_TARGET=ingress.linksetgo.com

TRUST_PROXY_HOST_HEADER=false
TRUST_PROXY_CLIENT_IP_HEADER=false

CLOUD_SIGNUP_ENABLED=false
# Choose exactly one complete delivery mode before enabling signup. This
# production example uses authenticated, mandatory STARTTLS.
CLOUD_SMTP_HOST=<SMTP_HOSTNAME>
CLOUD_SMTP_PORT=587
CLOUD_SMTP_SECURITY=starttls
CLOUD_SMTP_USERNAME=<SMTP_USERNAME>
CLOUD_SMTP_PASSWORD=<SMTP_PASSWORD>
CLOUD_SMTP_FROM_EMAIL=<VERIFIED_FROM_ADDRESS>
CLOUD_SMTP_FROM_NAME=LinksetGo Cloud
CLOUD_ACCOUNT_EMAIL_SWEEP_SECRET=<INDEPENDENT_32_CHARACTER_RANDOM_SECRET>
CLOUD_ACCOUNT_EMAIL_SWEEP_BATCH_SIZE=10
SOURCE_CODE_URL=https://github.com/bestmaa/linksetgo
NEXT_PUBLIC_APP_ENV=Production
NEXT_PUBLIC_DATABASE_LABEL=linksetgo
```

`NEXT_PUBLIC_SITE_URL` is the canonical marketing origin. Payload `serverURL`,
CORS, CSRF checks, authenticated mutation checks, checkout return URLs and
invitation links use the application origin, with `CLOUD_APP_BASE_URL` taking
priority in Cloud mode. `PUBLIC_LINK_BASE_URL` remains required at runtime and is
also the Community installation origin; Cloud does not use it as an unscoped
public resolver. `SHARED_LINK_BASE_URL` is the exact dedicated origin for Free
clean links. It must not share a hostname with the application or marketing
surface.

Keep `CLOUD_SIGNUP_ENABLED=false` until the verification-delivery adapter,
abuse controls and launch checks in [Cloud signup](./CLOUD_SIGNUP.md) are
operational. Enabling signup additionally requires exactly one of the
documented, complete HTTPS-webhook or authenticated-SMTP delivery modes.

Build the `runner` with these public arguments:

```dotenv
NEXT_PUBLIC_SITE_URL=https://linksetgo.com
NEXT_PUBLIC_APP_ENV=Production
NEXT_PUBLIC_DATABASE_LABEL=linksetgo
```

Do not put `DATABASE_URL`, `PAYLOAD_SECRET`, `EVENT_HASH_SECRET`, webhook
secrets, SMTP credentials, database passwords, certificate private keys, or
provider tokens in build arguments. Public build arguments are embedded in
browser-visible output.

The one-shot `migrator` needs `DATABASE_URL`, `PAYLOAD_SECRET`,
`EVENT_HASH_SECRET`, and `PUBLIC_LINK_BASE_URL`. Copying the non-secret edition
and application-origin values from the runner is safe but does not turn the
migrator into a web service. It does not need a domain, public port, TLS router,
or browser-facing build arguments.

## DNS and Cloudflare TLS

Create DNS records that send the managed service hosts to the trusted ingress:

| DNS name                | Record         | Target                | Proxy                                              |
| ----------------------- | -------------- | --------------------- | -------------------------------------------------- |
| `linksetgo.com`         | `A` or `CNAME` | Managed ingress       | Proxied                                            |
| `app.linksetgo.com`     | `A` or `CNAME` | Managed ingress       | Proxied                                            |
| `go.linksetgo.com`      | `A` or `CNAME` | Managed ingress       | Proxied                                            |
| `*.linksetgo.com`       | `A` or `CNAME` | Managed ingress       | Proxied                                            |
| `www.linksetgo.com`     | `CNAME`        | `linksetgo.com`       | Proxied, with an apex redirect rule                |
| `ingress.linksetgo.com` | `A` or `CNAME` | Custom-domain ingress | According to the selected custom-hostname provider |

Explicit `app` and `go` records are recommended even when the wildcard would resolve them.
The wildcard is one label deep: it covers `example.linksetgo.com`, not
`one.two.linksetgo.com`.

For the Cloudflare-to-origin connection:

1. Create one Cloudflare Origin CA certificate containing both
   `linksetgo.com` and `*.linksetgo.com`.
2. Store the origin certificate and its private key in Dokploy's certificate
   store. Never store the private key in Git or an environment variable.
3. Set Cloudflare SSL/TLS mode to **Full (strict)**.
4. In Dokploy, enable HTTPS and use the uploaded certificate through the
   custom-certificate/Traefik path documented by the installed Dokploy version.
   When Dokploy has already loaded the certificate globally, its domain
   certificate provider remains `None`.

A Cloudflare Origin CA certificate is trusted by Cloudflare, not by normal web
browsers. Do not expose that origin directly as a browser endpoint.

## Dokploy and Traefik routers

Create four managed-service routers to the same `LinksetGo Web`/LinksetGo `runner`:

| Router          | Host rule                                | Path | Internal path | Container port |
| --------------- | ---------------------------------------- | ---- | ------------- | -------------: |
| Marketing       | Exact `linksetgo.com`                    | `/`  | `/`           |         `3000` |
| Application     | Exact `app.linksetgo.com`                | `/`  | `/`           |         `3000` |
| Shared links    | Exact `go.linksetgo.com`                 | `/`  | `/`           |         `3000` |
| Workspace links | One-label wildcard under `linksetgo.com` | `/`  | `/`           |         `3000` |

For every router, leave path stripping off. The exact apex and application
routers and the exact shared-link router should have higher priority than the
wildcard router. DNS alone is not a Traefik route: after adding
`*.linksetgo.com` in DNS, verify that Dokploy emitted a wildcard/`HostRegexp`
router. If the installed Dokploy UI accepts only exact hosts, add the equivalent
Traefik rule through Dokploy's supported advanced configuration instead of
creating one router manually per workspace.

All four routers preserve the original `Host` header. Keep
`TRUST_PROXY_HOST_HEADER=false` in this topology. Set it to `true` only if a
separate trusted ingress blocks direct origin access, removes every
client-supplied `X-Forwarded-Host`, and writes exactly one normalized value.

Restrict direct access to the application container and origin ports with the
host firewall/security group. Cloudflare and the trusted operations network
should be the only expected ingress sources.

## Customer custom domains

The managed wildcard certificate does not cover `links.customer.com`. A custom
domain requires all of the following:

1. LinksetGo creates one exact pending domain and a server-generated ownership
   challenge.
2. The customer publishes the requested
   `_linksetgo-verification.links.customer.com` TXT value.
3. The customer publishes:

   ```dns
   links.customer.com CNAME ingress.linksetgo.com
   ```

4. The trusted provisioning adapter validates the TXT record and exact CNAME.
5. The adapter creates an exact ingress router and requests a certificate for
   `links.customer.com`.
6. LinksetGo publishes the host-scoped AASA and Asset Links documents.
7. The customer confirms that released iOS and Android builds trust the exact
   hostname; only then does the domain become active.

Configure the adapter only as a pair:

```dotenv
DOMAIN_PROVISIONING_WEBHOOK_URL=https://<TRUSTED_PROVISIONER_HOST>/<BOUNDED_ENDPOINT>
DOMAIN_PROVISIONING_WEBHOOK_SECRET=<AT_LEAST_32_RANDOM_CHARACTERS>
```

The adapter may use either a managed custom-hostname product such as Cloudflare
for SaaS or an exact Traefik router with a publicly trusted ACME certificate.
Whichever provider is selected must automate issuance, renewal, revocation and
router removal. A regular LinksetGo wildcard certificate cannot substitute for
the customer's certificate.

See [Domain ingress](./DOMAIN_INGRESS.md) for the signed webhook contract,
bounded responses, lifecycle transitions and failure behavior.

## First deployment and migrations

Use the same immutable source revision for `migrator` and `runner`:

1. Provision a dedicated PostgreSQL database and non-admin application role.
   Make that role the database owner and verify the internal connection from the
   Dokploy network.
2. Add server-only runtime secrets to both services. Add public build arguments
   only to the `runner`.
3. Configure the Cloudflare records, origin certificate and the four Dokploy
   routers. Keep traffic disabled or return maintenance responses until
   readiness succeeds.
4. Build and deploy the Docker target `migrator`. It runs
   `npm run migrate` and should exit successfully; it is not a permanent
   service.
5. Inspect migration logs. Do not deploy the web target after a failed or
   partially understood migration.
6. Build and deploy the Docker target `runner`. It runs `node server.js` and
   remains active.
7. Check `GET https://app.linksetgo.com/api/health/ready`; require HTTP `200`
   before enabling traffic. This verifies the process and database only.
8. Create the first private operator account and a disposable active quick link.
   Verify its clean page and resolver response through
   `https://go.linksetgo.com/{publicAppKey}/{linkSlug}`, and verify
   `https://go.linksetgo.com/admin/login` returns `404`.
9. Test one active paid workspace link and both association files from its real
   workspace hostname.

Keep migrator autodeploy disabled unless the delivery pipeline explicitly
serializes backup, migration and application rollout. Two independent services
building automatically from the same push can race; source equality does not
enforce migration order.

For every upgrade:

1. Read release notes and take a verified off-host backup.
2. Build migrator and runner from the same signed tag or commit.
3. Run migrator once and require a successful exit.
4. Deploy runner.
5. Verify readiness, login, one managed link, one custom-domain link if enabled,
   AASA, Asset Links, and rollback monitoring.

Rolling back the runner does not automatically reverse a database migration.
Use only release-documented rollback procedures.

## Verification matrix

After DNS and caches settle, verify these outcomes:

| Request                                                                           | Expected result                           |
| --------------------------------------------------------------------------------- | ----------------------------------------- |
| `https://linksetgo.com/`                                                          | Marketing landing page                    |
| `https://app.linksetgo.com/`                                                      | Redirect into login/dashboard             |
| `https://app.linksetgo.com/pricing`                                               | Redirect to apex pricing                  |
| `https://{active-workspace}.linksetgo.com/l/{appKey}/{linkSlug}`                  | Public resolver/fallback                  |
| `https://{active-workspace}.linksetgo.com/admin`                                  | `404`                                     |
| `https://{active-workspace}.linksetgo.com/.well-known/apple-app-site-association` | Host-scoped JSON with no redirect         |
| `https://{active-workspace}.linksetgo.com/.well-known/assetlinks.json`            | Host-scoped JSON with no redirect         |
| Unknown workspace or unverified custom hostname                                   | Fail closed without another tenant's data |

Validate desktop and mobile widths in Chrome and repeat universal-link/app-link
checks on physical iOS and Android devices.

## Community deployment

Community remains a single-host installation:

```dotenv
RELAY_EDITION=community
PUBLIC_LINK_BASE_URL=https://links.example.com
NEXT_PUBLIC_SITE_URL=https://links.example.com
MARKETING_SITE_URL=
CLOUD_APP_BASE_URL=
```

The same host serves login, dashboard, `/l/...`, AASA and Asset Links. Opening
its root sends the operator into the application; an unauthenticated user
continues to `/admin/login`. Community does not require the LinksetGo apex/app
split, a managed workspace wildcard, or hosted billing/signup variables.
Operators still need HTTPS, PostgreSQL, migrations, backups and a trusted
reverse proxy as documented in [Self-hosting](../self-hosting.md).
