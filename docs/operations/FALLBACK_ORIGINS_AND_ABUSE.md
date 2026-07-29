# Fallback-origin ownership and abuse operations

LinksetGo treats a fallback URL as a security boundary. A link can redirect a user
to that URL when the native app is unavailable, so an unverified fallback host
would otherwise become an open-redirect primitive.

## Cloud fallback origins

LinksetGo Cloud stores customer-owned hosts in the private `fallback-origins`
collection. A hostname:

- is one exact public DNS hostname, not a URL, wildcard, IP address, loopback
  address, LinksetGo installation hostname, or managed link hostname;
- belongs permanently to one workspace;
- begins in `pending`;
- publishes the generated
  `_linksetgo-fallback.<hostname>` TXT challenge;
- moves through `verifying` to `verified` only after exact TXT evidence; and
- can be moved to `revoked`, which immediately makes dependent public links
  unavailable.

Verification calls the provider-neutral
`DNSOwnershipEvidenceProvider.lookupTXT(recordName)` boundary. The caller
supplies only LinksetGo's generated record name. LinksetGo does not fetch an arbitrary
customer URL. Evidence is bounded before evaluation, and the database retains
SHA-256 hashes of observed TXT values rather than the raw values.

Cloud workspace owners and admins manage this lifecycle at
`/admin/fallback-origins`. The bounded, same-origin admin API provides:

- `GET/POST /api/admin/fallback-origins` to list or register a workspace host;
- `GET /api/admin/fallback-origins/{id}/instructions` for the fixed TXT record;
- `POST /api/admin/fallback-origins/{id}/actions` with exactly `verify` or
  `revoke`.

Every lookup is scoped by both the authenticated tenant grant and the selected
workspace. Registration is limited to ten attempts per actor/workspace per day;
verify/revoke is limited to 30 attempts per actor/origin per hour. Multi-instance
Cloud ingress must enforce matching distributed limits.

Workspace verification does not modify an app. Each app's
`allowedFallbackHosts` remains a narrower app-specific allowlist, and app
activation requires both workspace ownership proof and that app-level policy.

The default provider reuses the trusted domain-provisioning webhook configured
by `DOMAIN_PROVISIONING_WEBHOOK_URL` and
`DOMAIN_PROVISIONING_WEBHOOK_SECRET`. LinksetGo sends only:

```json
{
  "action": "lookup-txt",
  "recordName": "_linksetgo-fallback.www.company.com"
}
```

The adapter returns already-observed, bounded evidence:

```json
{
  "kind": "success",
  "value": {
    "observedAt": "2026-07-27T08:00:00.000Z",
    "values": ["linksetgo-fallback-verification=server-issued-token"]
  }
}
```

LinksetGo follows no redirect, times out after eight seconds, accepts at most 16
KiB, and validates that `recordName` is exactly the generated fallback TXT
name before contacting the adapter. Network or malformed-evidence failures
return the origin to `pending`, so a provider outage never leaves a tenant
record stranded in `verifying`.

An active Cloud app requires its default fallback host and every
`allowedFallbackHosts` entry to be verified for the same workspace. Runtime
resolution repeats the verification check so revocation fails closed without
requiring an app edit or redeploy.

In Community edition, LinksetGo does not require the Cloud ownership registry.
The app-specific fallback allowlist is an explicit operator policy: only
trusted workspace owners/admins should be allowed to change app or link
fallbacks. Self-hosters are responsible for their membership policy and for
confirming ownership of allowlisted hosts.

## Abuse intake

`POST /api/public/abuse-reports` accepts a small JSON report containing a
category, description, and credential-free HTTPS LinksetGo URL. The route:

- reads at most 8 KiB and requires JSON;
- strips query strings and fragments from retained target evidence;
- never fetches the submitted URL;
- performs exact database lookups only;
- returns a non-enumerating accepted response;
- HMAC-hashes request identity and user-agent evidence; and
- never logs or stores a raw client IP address.

The built-in fixed-window limiter is per process and provides defense in depth.
A multi-instance Cloud deployment **must** enforce a distributed ingress/WAF
limit for the same route. Current local limits are five reports per request
identity per hour and 25 per target hostname per day.

Identical submissions have a secret HMAC idempotency hash and are stored once,
including under a concurrent replay race.

## Operator cases and evidence

`abuse-reports`, `abuse-cases`, `abuse-case-events`, and
`enforcement-events` are private. Tenants cannot read, create, update, or
delete them. Case and enforcement events are append-only through application
services, and material evidence records are never deleted through collection
access.

Platform abuse holds are separate from ordinary tenant lifecycle status:

- `platformSuspended`
- `platformSuspendedAt`
- `platformRestoredAt`
- `platformSuspensionReason`
- `platformSuspensionCase`

These fields exist on organizations, workspaces, domains, apps, and deep
links. Only `setPlatformSuspension` can change them, using an active platform
super-admin request and one database transaction that also writes the
enforcement event. Raw REST/local Payload updates, including
`overrideAccess`, are rejected by the collection hook when they attempt an
actual hold change.

A tenant may change an ordinary `status` field, but that never clears
`platformSuspended`. Tenant access, public resolution, association output, and
runtime domain selection all exclude platform-suspended resources and their
suspended organization/workspace ancestors.

Restoration must also go through `setPlatformSuspension`. It records a second
event and a restoration timestamp while retaining the original suspension
reason, case reference, and event history.
