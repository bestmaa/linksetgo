# Team invitation delivery

Relay stores one-time organization invitations and delegates email delivery to a
trusted operator webhook. No mail vendor or credential ships enabled.

## Cloud configuration

Configure both invitation values together with the trusted Cloud application
origin:

```dotenv
CLOUD_APP_BASE_URL=https://app.relay.example
TEAM_INVITATION_WEBHOOK_URL=https://mailer.internal.example/relay-team-invitation
TEAM_INVITATION_WEBHOOK_SECRET=replace-with-at-least-32-random-characters
```

The webhook URL must use HTTPS without credentials or a fragment. Relay follows
no redirects, applies an eight-second timeout, authenticates with
`Authorization: Bearer <TEAM_INVITATION_WEBHOOK_SECRET>`, and expects a 2xx
response.

The JSON body has this contract:

```json
{
  "template": "relay-team-invitation",
  "email": "member@example.com",
  "expiresAt": "2026-07-28T00:00:00.000Z",
  "invitationURL": "https://app.relay.example/invite#token=one-time-secret",
  "inviterName": "Relay owner",
  "organizationName": "Example team",
  "role": "member"
}
```

Treat `invitationURL` as a secret. Do not log the body or place the URL in
analytics, redirects, query parameters, support tickets, or delivery-provider
metadata. Relay stores only a SHA-256 token digest and consumes the invitation
once. A delivery failure rolls back invitation creation.

## Community delivery

Community does not call the Cloud webhook. A platform super admin can select
manual delivery, copy the one-time fragment URL, and send it through an
operator-controlled secure channel. Ordinary organization owners cannot request
manual token disclosure.

## Edge controls

Built-in invitation limits are per process and privacy-hash request identity.
Multi-instance Cloud ingress must add distributed limits for invitation creation,
preview, and acceptance. Monitor delivery failures without logging recipient
tokens or raw client IP addresses.
