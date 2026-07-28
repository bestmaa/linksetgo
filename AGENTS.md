# Relay engineering rules

These rules apply to the entire repository.

## Architecture

- Keep the application a modular monolith: one Next.js/Payload deployment with
  explicit feature and domain boundaries.
- Frontend feature flow is always:
  `route -> connector -> custom hook -> typed view props -> pure view`.
- Route files compose connectors. They do not contain feature logic.
- Connectors call hooks and pass the returned view model into views as props.
- Hooks own browser state, effects, navigation, and client API orchestration.
- Presenters map API/domain data into display-ready view models.
- Views must not fetch, navigate, import Payload, call hooks, or apply business
  rules. Views render values and invoke callbacks received through props.
- Server-side authorization and business rules belong in domain/application
  services, never only in the browser.

## React and TypeScript

- Every `.tsx` file must stay at or below 250 physical lines.
- Split components by product responsibility before they approach the limit.
- Do not use `any`. Parse untrusted input as `unknown` at a typed boundary.
- Keep TypeScript strict options enabled.
- Prefer discriminated unions for status/result states.
- Do not hand-edit `src/payload-types.ts`.

## Data and security

- Payload collections are private by default. Public routes expose an explicit
  safe projection.
- Validate fallback URLs against an app-owned allowlist. Never create an open
  redirect.
- Do not log secrets, raw passwords, or raw client IP addresses.
- Use the project-specific PostgreSQL role; never use the shared admin role from
  application code.

## Verification

- Run `npm run check:architecture`, lint, typecheck, integration tests, and a
  production build before handoff.
- Browser-visible workflows require Chrome QA at desktop and mobile widths.
