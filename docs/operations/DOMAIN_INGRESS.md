# Domain ingress contract

LinksetGo stores domain ownership and lifecycle state and orchestrates a trusted
operator adapter. The application never resolves arbitrary customer URLs and
does not embed a DNS or certificate-controller credential in the browser.
The concrete apex, application, wildcard, Dokploy and certificate topology for
the managed service is documented in
[LinksetGo production deployment](./LINKSETGO_PRODUCTION.md).

## Configuration

```dotenv
MANAGED_LINK_ROOT_DOMAIN=linksetgo.example
MANAGED_INGRESS_CNAME_TARGET=ingress.linksetgo.example
TRUST_PROXY_HOST_HEADER=false

# Optional. Configure both or neither.
DOMAIN_PROVISIONING_WEBHOOK_URL=https://provisioner.internal.example/linksetgo/domain
DOMAIN_PROVISIONING_WEBHOOK_SECRET=replace-with-at-least-32-random-characters
```

`MANAGED_LINK_ROOT_DOMAIN` reserves workspace hostnames such as
`example.linksetgo.example`. `MANAGED_INGRESS_CNAME_TARGET` is the exact CNAME
target shown during custom-domain verification.

Keep `TRUST_PROXY_HOST_HEADER=false` when Next.js receives the public `Host`
header unchanged. Enable it only when the deployment has one trusted ingress
that:

1. rejects direct access to the LinksetGo application;
2. removes every client-supplied `X-Forwarded-Host` header; and
3. writes one normalized public hostname into `X-Forwarded-Host`.

LinksetGo rejects multiple forwarded host values. An unknown hostname never falls
back to the legacy global resolver.

`DOMAIN_PROVISIONING_WEBHOOK_URL` must be one HTTPS URL without credentials or a
fragment. LinksetGo sends its secret as a bearer token, follows no redirects, uses
an eight-second timeout, and accepts at most 16 KiB of JSON. Leaving both
webhook values empty keeps automatic checks disabled, which is the Community
default. A partial or unsafe configuration fails closed.

## Lifecycle ownership

LinksetGo enforces this sequence:

```text
pending-dns -> verifying -> certificate-ready -> association-incomplete -> active
```

The console's **Check DNS & TLS** action is authenticated, workspace-scoped,
rate-limited, serialized with a PostgreSQL advisory transaction lock, and
subject to a persistent retry cooldown. The application asks the configured
adapter to inspect:

- TXT `_linksetgo-verification.{hostname}` with the exact LinksetGo challenge; and
- the customer hostname CNAME with the exact configured ingress target.

The adapter receives only the action and normalized hostname:

```json
{ "action": "inspect-dns", "hostname": "links.example.com" }
```

It returns already-observed evidence:

```json
{
  "kind": "success",
  "value": {
    "cnameTargets": ["ingress.linksetgo.example"],
    "txtValues": ["linksetgo-domain-verification=server-issued-token"]
  }
}
```

LinksetGo compares that evidence with its own server-issued challenge and configured
ingress target. The adapter then receives:

```json
{ "action": "request-certificate", "hostname": "links.example.com" }
```

Valid TLS responses are:

```json
{ "kind": "success", "value": { "kind": "pending" } }
```

or:

```json
{
  "kind": "success",
  "value": {
    "kind": "ready",
    "certificateID": "opaque-provider-reference",
    "renewsAt": "2027-07-27T00:00:00.000Z"
  }
}
```

The opaque certificate reference and renewal time are operator-only fields.
Provider errors are bounded and sanitized before they reach tenant users.

The same authenticated webhook also performs Cloud fallback-origin ownership
checks. That operation receives a server-generated fixed TXT name, never a
tenant URL:

```json
{
  "action": "lookup-txt",
  "recordName": "_linksetgo-fallback.www.example.com"
}
```

Its successful response contains the observation time and TXT strings:

```json
{
  "kind": "success",
  "value": {
    "observedAt": "2026-07-27T08:00:00.000Z",
    "values": ["linksetgo-fallback-verification=server-issued-token"]
  }
}
```

The application bounds and hashes this evidence before persistence. Supporting
`lookup-txt` is required before LinksetGo Cloud tenants can activate apps that use
customer-owned fallback hosts.

After TLS readiness, LinksetGo publishes host-scoped AASA and Android Asset Links
while routing remains gated. An organization owner must type the exact hostname
and explicitly confirm that released, signed mobile builds trust it. Only then
does the domain become `active`. Managed workspace links remain available
throughout this process.

Platform abuse holds on the domain, workspace, organization, or app override
tenant lifecycle state and cannot be cleared by a customer action.

## Required ingress work

Production Cloud still needs infrastructure outside this repository:

- wildcard TLS and routing for the managed root domain;
- automated certificate issuance and renewal for verified custom domains;
- a trusted webhook adapter that performs bounded DNS observation and talks to
  the certificate controller;
- direct-origin firewalling and trusted-proxy enforcement;
- domain deletion/revocation propagation; and
- monitoring for DNS drift, certificate expiry, and association-file failures.

Without a configured adapter, the tenant action remains unavailable. Community
operators can keep this fail-closed default and advance evidence manually from
the private operator console, or implement the documented provider contract.
Never mark a domain active before DNS ownership, CNAME, TLS, association-file,
and signed mobile-build checks all pass.
