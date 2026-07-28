# LinksetGo Cloud signup

Public signup is intentionally unavailable in LinksetGo Community. LinksetGo Cloud opens
the endpoint only when both controls are explicit:

```dotenv
RELAY_EDITION=cloud
CLOUD_SIGNUP_ENABLED=true
```

Cloud operators must also configure:

```dotenv
CLOUD_APP_BASE_URL=https://app.linksetgo.example
MANAGED_LINK_ROOT_DOMAIN=linksetgo.example
CLOUD_VERIFICATION_WEBHOOK_URL=https://mailer.internal.example/relay-verification
CLOUD_VERIFICATION_WEBHOOK_SECRET=replace-with-at-least-32-random-characters
```

If any value is absent or unsafe, `/signup`, `/api/auth/signup`, and email
verification fail closed. `CLOUD_APP_BASE_URL` is the trusted origin used in
one-time email links. The webhook must use HTTPS outside local development and
must return a 2xx response after accepting the message.

LinksetGo sends verification messages with the `relay-cloud-verify-email` template
and password resets with `relay-cloud-reset-password`. Both JSON bodies contain
`email`, `name`, `expiresAt`, and `template`; verification adds
`verificationURL`, while recovery adds `resetURL`. LinksetGo authenticates with:

```text
Authorization: Bearer <CLOUD_VERIFICATION_WEBHOOK_SECRET>
```

The webhook must never log or expose either URL. The secret token is placed in
the URL fragment, so browsers do not send it in the initial page request. LinksetGo
stores only a SHA-256 digest of signup verification tokens. Password reset
tokens use Payload's built-in one-hour, one-time recovery flow. A transaction
is committed only after the webhook accepts the message; a delivery failure
therefore leaves no usable verification or reset token.

Signup creates a pending user, organization, workspace, disabled owner
membership, and a managed domain as one PostgreSQL transaction. Verification
atomically activates the user and tenant graph. Public signup also refuses to
run until an active platform super-admin exists, so it cannot win the Payload
first-owner bootstrap race.

## Resend and pending reservations

`/resend-verification` and `/api/auth/resend-verification` always return a
generic accepted response for syntactically valid email addresses. They do not
reveal whether an account exists or whether delivery succeeded. A successful
resend atomically replaces the previous token.

Verification tokens normally expire after 24 hours. Resends cannot move an
account's verification deadline beyond seven days from its original
`createdAt`, so abandoned workspace and managed-domain reservations cannot be
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
organization, one pending workspace, and the expected managed domain. It skips
the graph if it finds another membership, app, fallback origin, invitation,
subscription, billing or usage record, abuse record/case, enforcement event,
platform suspension, or any unexpected relationship. Investigate persistent
`skipped` records manually; do not delete them with an unrestricted database
query.

## Password recovery

LinksetGo Cloud exposes `/forgot-password` and `/reset-password`. Forgot-password
responses are non-enumerating for active, unknown, and disabled accounts.
Reset links expire after one hour and are consumed by Payload's reset operation.
The browser removes the fragment token from the address before rendering the
password form, and the API accepts only a strong 12–128 character password.

Turning `CLOUD_SIGNUP_ENABLED` off closes new signup and verification resend,
but does not disable password recovery for existing Cloud users. Recovery still
requires the trusted app origin and authenticated delivery webhook shown above.

The bundled in-memory limiter protects a single process and hashes request
identifiers before storage. Production Cloud ingress must add a distributed
rate limit (and adaptive bot protection) before requests reach LinksetGo. This
applies to signup, verification, resend, forgot-password, reset-password, and
public abuse-report endpoints.

`TRUST_PROXY_CLIENT_IP_HEADER` defaults to `false` and is independent from
`TRUST_PROXY_HOST_HEADER`. Set it to `true` only when the final trusted ingress
removes every client-supplied `X-Forwarded-For` and `X-Real-IP` header, then
replaces them with exactly one canonical IPv4 or IPv6 value. LinksetGo rejects
comma-separated or malformed values for rate-limit identity. Appending to a
client-provided forwarding chain is not safe.
