# Fallback URL safety

LinksetGo treats a fallback URL as ready only when both independent controls pass:

1. the fallback hostname has a current DNS TXT ownership verification; and
2. the exact canonical HTTPS URL has a fresh `safe` assessment.

Missing, pending, expired, errored, or unsafe assessments fail closed. The public resolver must
not redirect to such a URL.

## Transactional bindings and capacity

Cloud app and deep-link create/update operations apply fallback ownership and exact-URL safety
through one transactional binding service. This includes the Payload collection APIs, console
edit routes, app onboarding, saved-link creation, and quick-link creation. A failed resource
write rolls back any origin or assessment created for it. Replacing, clearing, or deleting a
resource removes its assessment only after the last app or deep link in that workspace stops
referencing the same canonical URL.

Safety records have deterministic plan-derived caps so public collection calls cannot amplify
DNS or malware-provider work:

| Plan       | Live exact-URL assessments | Retained assessment records | Fallback origins |
| ---------- | -------------------------: | --------------------------: | ---------------: |
| Cloud Free |                         26 |                          31 |                5 |
| Starter    |                      2,505 |                       2,530 |               25 |
| Pro        |                     10,020 |                      10,120 |              100 |
| Community  |                  Unlimited |                   Unlimited |        Unlimited |

The origin cap is `min(savedLinks, max(5, apps × 5))`. The live-assessment cap is
`savedLinks + apps`; it counts exact canonical URLs currently referenced by an app or deep link.
The retained-record cap adds `min(savedLinks, origin cap)` to that live cap. This bounded allowance
can reuse a recent paid provider verdict after a URL is replaced without permitting unbounded
unique-URL churn. A same-workspace replacement releases the previous live slot in the same
transaction. Checks and creates run under organization and exact-URL advisory locks, so concurrent
requests cannot cross a cap. Community collection behavior remains unchanged.

## Existing Cloud fallback backfill

The migration that introduces exact-URL assessments does not silently trust legacy app or
deep-link fallback values. Before enabling the safety sweep on an existing Cloud database, run
the operator backfill. It inventories fallback values in bounded pages and reports counts only;
it never logs or fetches a tenant URL.

Preview the work first. Dry run is the default:

```bash
npm run backfill:fallback-safety
```

The preview:

- reuses only a pending, verifying, or verified origin owned by the exact workspace;
- treats the same hostname in different workspaces as independent registrations;
- reports revoked origins without restoring them;
- reports missing origins and missing exact-URL assessments; and
- does not create, update, verify, or scan anything.

Review `invalidURLs`, `unscopedCandidates`, `revokedOrigins`, and `failures`.
Resolve or explicitly retire the affected legacy fallback records before relying on fallback
delivery. The summary intentionally contains no URL, hostname, record ID, or user data.

After reviewing the preview, explicitly apply the registration:

```bash
npm run backfill:fallback-safety -- --apply
```

`--apply` creates missing origins in `pending` state and queues only missing exact-URL assessments
in `pending` state. It never marks DNS ownership verified and never changes an existing assessment
verdict. Hostname work is transaction-locked, and the database uniqueness constraints make repeat
runs safe. A second completed run should report the records as existing rather than creating
duplicates.

The page size defaults to 50 and is hard-bounded to 100:

```bash
npm run backfill:fallback-safety -- --dry-run --page-size 100
```

Apply mode requires an active platform super-admin so the normal fallback-origin lifecycle still
generates the ownership challenge and enforces hostname policy. The command does not expose or
use that account's credentials.

Recommended deployment order:

1. Back up PostgreSQL and apply all migrations through
   `20260730_134938_fallback_origin_dns_freshness`, including
   `20260730_120636_shared_free_links_and_fallback_safety`.
2. Run the dry-run backfill and resolve unexpected counts.
3. Run the apply backfill.
4. Confirm `failures` is zero.
5. Publish each pending origin's DNS TXT challenge and complete normal ownership verification.
6. Configure the URL-safety provider and start the durable sweep.
7. Confirm required exact URLs become fresh and safe before enabling fallback delivery.

## Provider setup

The sandboxed fallback-URL scanner is mandatory. Configure the operator-owned
adapter:

```dotenv
FALLBACK_URL_SAFETY_WEBHOOK_URL=https://scanner.operator.example/url-safety
FALLBACK_URL_SAFETY_WEBHOOK_SECRET=replace-with-a-long-random-secret
FALLBACK_URL_SAFETY_MAX_AGE_SECONDS=3600
```

The webhook is a fixed operator URL. LinksetGo authenticates every request with
`Authorization: Bearer <FALLBACK_URL_SAFETY_WEBHOOK_SECRET>`. The scanner must
validate that secret in constant time before parsing or queuing work. It then
receives `POST` JSON containing
`{"action":"assess-url","url":"https://canonical.example/path"}` and returns one
of:

```json
{ "kind": "safe", "value": { "observedAt": "2026-07-30T10:00:00Z", "redirectCount": 0 } }
```

```json
{
  "kind": "unsafe",
  "value": { "observedAt": "2026-07-30T10:00:00Z", "redirectCount": 0, "threats": ["malware"] }
}
```

For a temporary scanner failure, it may return:

```json
{ "kind": "error", "message": "Scanner temporarily unavailable.", "retryable": true }
```

The webhook may include `expiresAt` in `value`. LinksetGo uses the earlier of that instant and
the configured maximum age. A `safe` or `unsafe` result is rejected if `observedAt` is more than
five minutes old or more than two minutes in the future. Provider errors and malformed,
oversized, stale, or future-dated responses remain unready.

Run this adapter in an egress-isolated sandbox that blocks private, loopback,
link-local, metadata-service, and internal network destinations on every DNS
resolution and redirect hop. Bound response bytes, redirect count, content
inspection time, and decompression. LinksetGo never treats a reputation lookup
alone as a safe verdict.

Google Cloud Web Risk Lookup API is optional defense in depth:

```dotenv
GOOGLE_WEB_RISK_API_KEY=replace-with-a-restricted-api-key
```

When this key is configured, LinksetGo first asks the fixed
`https://webrisk.googleapis.com/v1/uris:search` endpoint about `MALWARE`,
`SOCIAL_ENGINEERING`, and `UNWANTED_SOFTWARE`. A reputation hit blocks the URL.
A reputation miss must still pass the mandatory sandboxed redirect/content
scanner; configuring Google without the scanner fails closed. The API key is
sent in the `x-goog-api-key` header, never in the request URL. Restrict it to
Web Risk and, where supported, to the worker's egress addresses.

Official references:

- [Web Risk Lookup API](https://docs.cloud.google.com/web-risk/docs/lookup-api)
- [`uris.search` REST reference](https://docs.cloud.google.com/web-risk/docs/reference/rest/v1/uris/search)
- [Use API keys securely](https://docs.cloud.google.com/docs/authentication/api-keys-use)

## Durable sweep

Creating or editing a fallback queues a database record; it does not wait for the external
provider. A scheduler processes that queue:

```dotenv
FALLBACK_URL_SAFETY_SWEEP_SECRET=replace-with-another-long-random-secret
FALLBACK_URL_SAFETY_SWEEP_BATCH_SIZE=20
```

Call the route every minute or every few minutes:

```bash
curl --fail-with-body --request POST \
  --header "Authorization: Bearer $FALLBACK_URL_SAFETY_SWEEP_SECRET" \
  https://app.example.com/api/internal/fallback-url-safety/sweep
```

The repository also includes `.github/workflows/fallback-safety-sweep.yml`, which runs every five
minutes and can be started manually. Configure these GitHub Actions secrets before enabling
production fallback delivery:

```text
FALLBACK_URL_SAFETY_SWEEP_URL=https://app.example.com/api/internal/fallback-url-safety/sweep
FALLBACK_URL_SAFETY_SWEEP_SECRET=<the same production bearer secret>
```

The batch size is bounded to 1–50. Claims are stored in PostgreSQL with a lease, so overlapping
workers cannot process the same current record and an interrupted claim becomes eligible again.
Pending records are processed, provider errors are retried after a cooldown, and expired safe or
unsafe assessments are rechecked. The response contains counts only; it never exposes or logs
fallback URLs, API keys, or sweep credentials.

Before a provider call, the worker rechecks the assessment under the same exact-URL lock used by
resource mutations. An assessment with no live app or deep-link reference is deleted and counted
as `orphaned`; the provider is never called for it. This also safely retains an assessment shared
by several resources until the final reference is removed.

The same authenticated call first renews due fallback-origin TXT ownership
leases, then processes exact-URL safety assessments. DNS renewal uses Cloud's
built-in fixed-record resolver or the configured trusted provisioning webhook.
Trusted DNS-webhook evidence is also rejected when its `observedAt` is more
than five minutes old or more than two minutes in the future; accepted evidence
then remains subject to the configured ownership-evidence lifetime and outage
grace. The defaults are 24 hours for evidence and a non-extendable six-hour
grace.
See [Fallback-origin ownership and abuse operations](./FALLBACK_ORIGINS_AND_ABUSE.md)
for evidence lifetime, outage grace, and batch settings.

Apply all migrations through `20260730_134938_fallback_origin_dns_freshness`
before enabling the scheduler. The earlier
`20260730_120636_shared_free_links_and_fallback_safety` migration adds the
assessment and claim state; `134938` adds the DNS verification-expiry and
outage-grace state used by the same combined sweep.

## Migration rollback warning

The `down()` for
`20260730_120636_shared_free_links_and_fallback_safety` is intentionally
irreversible and always refuses to run. The old schema's global hostname
uniqueness cannot preserve independent same-hostname ownership records across
workspaces. It also cannot preserve the migration's shared-link routing,
nullable fallback state, or exact-URL safety evidence without losing or
inventing tenant state. Do not attempt `migrate:down` for this migration and do
not remove tenant records to force a rollback. Restore a verified pre-migration
PostgreSQL backup in a controlled maintenance window instead.
