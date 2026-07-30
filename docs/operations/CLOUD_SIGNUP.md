# LinksetGo Cloud signup

Public signup is intentionally unavailable in LinksetGo Community. LinksetGo Cloud opens
the endpoint only when both controls are explicit:

```dotenv
RELAY_EDITION=cloud
CLOUD_SIGNUP_ENABLED=true
```

Cloud operators must also configure the application and shared-link origins:

```dotenv
CLOUD_APP_BASE_URL=https://app.linksetgo.example
SHARED_LINK_BASE_URL=https://go.linksetgo.example
```

Then configure exactly one complete email-delivery mode. A trusted HTTPS
adapter remains supported:

```dotenv
CLOUD_VERIFICATION_WEBHOOK_URL=https://mailer.internal.example/relay-verification
CLOUD_VERIFICATION_WEBHOOK_SECRET=replace-with-at-least-32-random-characters
```

Or deliver directly through the operator's authenticated SMTP server:

```dotenv
CLOUD_SMTP_HOST=smtp.example.com
CLOUD_SMTP_PORT=587
CLOUD_SMTP_SECURITY=starttls
CLOUD_SMTP_USERNAME=linksetgo@example.com
CLOUD_SMTP_PASSWORD=replace-with-the-smtp-account-password
CLOUD_SMTP_FROM_EMAIL=linksetgo@example.com
CLOUD_SMTP_FROM_NAME=LinksetGo Cloud
```

`CLOUD_SMTP_SECURITY` must be `starttls` or `implicit-tls`. STARTTLS is
mandatory, not opportunistic; implicit TLS is normally served on port 465.
Both modes require certificate validation with TLS 1.2 or newer, authenticated
SMTP, and bounded DNS, connection, greeting, and socket timeouts. Restrict the
SMTP account to sending as `CLOUD_SMTP_FROM_EMAIL`, rotate its password through
the deployment secret store, and do not place it in build arguments.

If the application origin or selected delivery mode is absent or unsafe,
signup, verification resend, and password recovery fail closed. A partial
webhook, a partial SMTP configuration, or configuring both delivery modes is
invalid. `CLOUD_APP_BASE_URL` is the trusted origin used in one-time email
links. `SHARED_LINK_BASE_URL` is additionally required for signup and
verification resend; it is the exact clean-link resolver origin and must use a
hostname separate from the application and marketing sites. The webhook must
use HTTPS outside local development and must return a 2xx response after
accepting the message.

In webhook mode, LinksetGo sends verification messages with the
`relay-cloud-verify-email` template and password resets with
`relay-cloud-reset-password`. Both JSON bodies contain `email`, `name`,
`expiresAt`, and `template`; verification adds `verificationURL`, while
recovery adds `resetURL`. LinksetGo authenticates with:

```text
Authorization: Bearer <CLOUD_VERIFICATION_WEBHOOK_SECRET>
```

Neither delivery system may log or expose either URL. Direct SMTP messages use
plain-text and escaped HTML bodies, do not load remote assets, and disable
Nodemailer's file and URL access. The secret token is placed in the URL
fragment, so browsers do not send it in the initial page request. LinksetGo
stores only a SHA-256 digest of signup verification tokens. Password reset
tokens are 32 random bytes and only an HMAC-SHA-256 digest is stored on the user.
The raw bearer exists only in the email delivery object, which is AES-256-GCM
encrypted before it is inserted into Payload's durable job queue. Token state
and the encrypted job are committed in the same transaction. SMTP and webhook
latency therefore never holds a user transaction or advisory lock open. If
delivery fails, Payload retries the encrypted job with bounded exponential
backoff; public endpoints keep the same non-enumerating response and never
expose provider details. A later resend atomically replaces the previous token.

Signup creates a pending user, organization, workspace, and disabled owner
membership as one PostgreSQL transaction. It does not reserve or provision a
per-workspace domain. Verified Free accounts publish clean links through
`SHARED_LINK_BASE_URL` and can add paid custom-domain configuration later.
Verification atomically activates the user and tenant graph. Public signup also refuses to
run until an active platform super-admin exists, so it cannot win the Payload
first-owner bootstrap race.

The signup form derives a collision-resistant internal workspace slug; customers
do not have to choose one. A newly queued verification and an existing email
both return the same generic `202` projection. Email availability is evaluated
before the derived slug so a lost-response retry follows the same generic
resend path instead of exposing an internal workspace collision.

Before enabling signup, route the exact shared hostname to the same runner
without stripping the path, provision its DNS and TLS, and verify that a known
test link loads at `/{publicAppKey}/{linkSlug}` while `/admin/login` returns
`404`. The application readiness endpoint verifies process/database readiness;
it does not replace this external DNS, TLS, host-routing, and resolver check.

## Resend and pending reservations

`/resend-verification` and `/api/auth/resend-verification` always return a
generic accepted response for syntactically valid email addresses. They do not
reveal whether an account exists or whether delivery succeeded. Both resend and
forgot-password apply the same bounded response-time floor plus random jitter.
A successful resend atomically replaces the previous token and inserts its
encrypted delivery job before committing and releasing the transaction-scoped
lock. Concurrent resend requests serialize token rotation. Only the newest
committed token remains valid; an earlier queued email may still arrive, but
its token cannot verify the account.

Verification tokens normally expire after 24 hours. Resends cannot move an
account's verification deadline beyond seven days from its original
`createdAt`, so abandoned account and workspace reservations cannot be
extended forever. A pending graph becomes cleanup-eligible only after its
current token has also been expired for the seven-day reclaim grace period.

Run the bounded cleanup job from a trusted Cloud worker or scheduler:

```sh
npm run prune:pending-signups -- --limit 100
```

Run it daily until the reported `pruned` count is zero. Each candidate is
handled in its own PostgreSQL transaction under a transaction-scoped advisory
lock shared with verification and resend.

Cleanup deliberately fails safe. LinksetGo deletes a graph only when it still has
exactly one pending user, one disabled owner membership, one pending
organization, and one pending workspace. New shared-link signups have no domain;
the cleanup job also recognizes one legacy managed-domain record so pre-migration
pending signups remain reclaimable. It skips
the graph if it finds another membership, app, fallback origin, invitation,
subscription, billing or usage record, abuse record/case, enforcement event,
platform suspension, or any unexpected relationship. Investigate persistent
`skipped` records manually; do not delete them with an unrestricted database
query.

## Password recovery

LinksetGo Cloud exposes `/forgot-password` and `/reset-password`. Forgot-password
responses are non-enumerating for active, unknown, and disabled accounts.
Reset links expire after one hour. The database never stores their raw bearer
token: it stores only the dedicated HMAC digest and expiry fields. A successful
password change clears that digest and expiry, removes every stored session,
and clears account lock state in one database update and transaction. Every
pre-reset browser or API token must authenticate again. If the update fails,
the password change, token consumption, and session revocation roll back
together.
Concurrent recovery requests use the same per-user lock for token rotation and
consumption. Only the newest reset token can be used, even if an older
in-flight email arrives later.
The browser removes the fragment token from the address before rendering the
password form, and the API accepts only a strong 12–128 character password.

Turning `CLOUD_SIGNUP_ENABLED` off closes new signup and verification resend,
but does not disable password recovery for existing Cloud users. Recovery still
requires the trusted app origin and exactly one authenticated delivery mode
shown above.

## Durable account-email worker

Configure an independent worker secret and optional batch size:

```dotenv
CLOUD_ACCOUNT_EMAIL_SWEEP_SECRET=replace-with-an-independent-32-character-secret
CLOUD_ACCOUNT_EMAIL_SWEEP_BATCH_SIZE=10
```

Apply migration `20260730_152807_account_recovery_outbox`, then configure the
repository secrets `CLOUD_ACCOUNT_EMAIL_SWEEP_URL` (ending in
`/api/internal/cloud-account-email/sweep`) and
`CLOUD_ACCOUNT_EMAIL_SWEEP_SECRET`. The scheduled workflow drains queued jobs
every five minutes. Next.js also attempts a post-response drain for low latency;
that attempt is only an accelerator—the committed database job remains the
source of reliability if the process exits or delivery fails. The sweep endpoint
uses constant-time bearer authentication and is not exposed on public resolver
hosts.

## Distributed request throttling

Cloud signup, email verification, verification resend, forgot-password, and
reset-password use PostgreSQL-backed fixed-window throttles. The windows are
shared by every application replica and include installation-wide ceilings in
addition to request- or email-scoped limits. Quick-link creation uses the same
PostgreSQL provider and permits 30 creates per actor and workspace per hour.
Only keyed SHA-256 hashes of request, email, actor, and workspace identities are
stored; raw email addresses and client IP addresses are never written to the
rate-limit table. If the provider cannot read or atomically update PostgreSQL,
it fails closed and returns a bounded retry time.

Apply the `20260730_142500_distributed_auth_rate_limits` migration before
enabling public signup or quick-link creation. Production ingress should still
add adaptive bot protection and coarse edge limits as defense in depth; those
controls do not replace LinksetGo's replica-coordinated application limits.

`TRUST_PROXY_CLIENT_IP_HEADER` defaults to `false` and is independent from
`TRUST_PROXY_HOST_HEADER`. Set it to `true` only when the final trusted ingress
removes every client-supplied `X-Forwarded-For` and `X-Real-IP` header, then
replaces them with exactly one canonical IPv4 or IPv6 value. LinksetGo rejects
comma-separated or malformed values for rate-limit identity. Appending to a
client-provided forwarding chain is not safe.
