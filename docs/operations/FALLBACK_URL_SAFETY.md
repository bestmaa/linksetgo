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

1. Back up PostgreSQL and apply the fallback-safety schema migration.
2. Run the dry-run backfill and resolve unexpected counts.
3. Run the apply backfill.
4. Confirm `failures` is zero.
5. Publish each pending origin's DNS TXT challenge and complete normal ownership verification.
6. Configure the URL-safety provider and start the durable sweep.
7. Confirm required exact URLs become fresh and safe before enabling fallback delivery.

## Provider setup

The preferred managed provider is Google Cloud Web Risk Lookup API. Set:

```dotenv
GOOGLE_WEB_RISK_API_KEY=replace-with-a-restricted-api-key
FALLBACK_URL_SAFETY_MAX_AGE_SECONDS=3600
```

LinksetGo sends the canonical URL only to the fixed
`https://webrisk.googleapis.com/v1/uris:search` endpoint and asks for `MALWARE`,
`SOCIAL_ENGINEERING`, and `UNWANTED_SOFTWARE`. It never fetches a tenant-controlled URL.
The API key is sent in the `x-goog-api-key` header, never in the request URL. Restrict the key to
Web Risk and, where the deployment supports it, to the worker's egress addresses. Google
configuration takes precedence when both provider options are present.

Official references:

- [Web Risk Lookup API](https://docs.cloud.google.com/web-risk/docs/lookup-api)
- [`uris.search` REST reference](https://docs.cloud.google.com/web-risk/docs/reference/rest/v1/uris/search)
- [Use API keys securely](https://docs.cloud.google.com/docs/authentication/api-keys-use)

Alternatively, configure the operator-owned adapter:

```dotenv
FALLBACK_URL_SAFETY_WEBHOOK_URL=https://scanner.operator.example/url-safety
FALLBACK_URL_SAFETY_WEBHOOK_SECRET=replace-with-a-different-long-random-secret
FALLBACK_URL_SAFETY_MAX_AGE_SECONDS=3600
```

The webhook is a fixed operator URL. It receives `POST` JSON containing
`{"action":"assess-url","url":"https://canonical.example/path"}` and must return one of:

```json
{ "kind": "safe", "value": { "observedAt": "2026-07-30T10:00:00Z", "redirectCount": 0 } }
```

```json
{
  "kind": "unsafe",
  "value": { "observedAt": "2026-07-30T10:00:00Z", "redirectCount": 0, "threats": ["malware"] }
}
```

The webhook may include `expiresAt` in `value`. LinksetGo uses the earlier of that instant and
the configured maximum age. A `safe` or `unsafe` result is rejected if `observedAt` is more than
five minutes old or more than two minutes in the future. Provider errors and malformed,
oversized, stale, or future-dated responses remain unready.

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

Deploy the schema migration that adds the assessment claim fields before enabling the scheduler.

## Migration rollback warning

The old schema permits only one fallback-origin record per hostname across the whole installation.
The rollback therefore refuses to run while workspace-scoped fallback origins share a hostname;
it never chooses a record or silently deletes another workspace's ownership proof. Export or
explicitly remove the conflicting records before retrying a rollback. A successful rollback still
removes exact-URL safety assessments because the old schema has nowhere to store them, so back up
PostgreSQL first.
