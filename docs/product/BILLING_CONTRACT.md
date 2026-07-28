# Relay Cloud billing contract

Relay Cloud billing is provider-neutral. The domain model stores plan and
subscription state; a replaceable provider adapter owns checkout, customer portal,
signature verification, and webhook parsing.

## Published beta plans

| Plan    | Monthly price | Apps | Active links | Resolutions | Retention | Members | Custom domains |
| ------- | ------------: | ---: | -----------: | ----------: | --------: | ------: | -------------: |
| Free    |            $0 |    1 |           25 |       5,000 |    7 days |       1 |              0 |
| Starter |            $5 |    3 |          250 |      25,000 |   30 days |       2 |              0 |
| Pro     |           $10 |   10 |        2,000 |     100,000 |   90 days |       5 |              1 |

Prices are stored as integer USD minor units: `500` and `1000`. The versioned plan
catalog is the source of truth for display and server enforcement.

## Required provider behavior

1. The browser chooses only a server-known plan key.
2. The server creates checkout using its own price mapping.
3. Webhook signatures are verified against the raw body.
4. Provider event IDs have a unique database constraint.
5. Duplicate events acknowledge successfully without a second mutation.
6. Older events do not overwrite newer subscription state.
7. Checkout success pages do not grant entitlements before a verified event.
8. Customer and subscription IDs remain private from tenant mutation APIs.

Community mode uses a disabled billing adapter and Community entitlements. It never
creates a fake paid subscription.

## Quota behavior

- At 80%, the console warns.
- At 100%, the relevant new creation is blocked atomically.
- Concurrent creates reserve capacity in the same database transaction.
- Resolution overage can stop new tracked analytics or request an upgrade, but an
  ordinary payment failure does not immediately break already-shared links.
- A separate abuse suspension can disable resolution after review.

## Subscription access

`active` and `trialing` allow new creation. `past-due` keeps full access through a
configured grace date, then blocks new creation while existing links continue to
resolve. A cancellation remains active through the paid period. `paused` blocks
new creation but preserves resolution.

## Launch gates

Before real payment collection:

- select and configure a provider;
- publish final legal entity, tax, refund, cancellation, invoice, and privacy
  terms;
- test signed webhook replay and out-of-order delivery;
- test checkout abandonment and failed-payment grace;
- meter real infrastructure/support cost against beta limits;
- add support escalation and manual reconciliation tools;
- complete an off-host restore drill.
