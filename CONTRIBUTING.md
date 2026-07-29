# Contributing to LinksetGo

Thank you for improving LinksetGo. Small, focused changes with tests and clear
migration notes are easiest to review.

## Before opening a pull request

1. Search existing issues and discussions.
2. For a security issue, stop and follow [SECURITY.md](./SECURITY.md).
3. For a schema, URL-contract, authentication, billing, or licensing change, open
   a design issue before implementation.
4. Keep the modular-monolith and feature boundaries in [AGENTS.md](./AGENTS.md).

## Development

LinksetGo uses Node.js 22, npm, Next.js, Payload, and PostgreSQL. The contributor setup
in [README.md](./README.md) provisions isolated local and test databases. Never run
integration cleanup or an unreconciled migration against production data.

```bash
npm install
npm run dev
```

Before submitting:

```bash
npm run check:architecture
npm run lint
npm run typecheck
npm run test:int
npm run build
npm run test:e2e
```

Browser-visible changes must be checked at desktop and mobile widths. Schema
changes require a committed Payload migration and an upgrade note. Do not edit
`src/payload-types.ts` by hand; regenerate it through Payload.

## Pull requests

- Explain the user problem and the chosen behavior.
- Identify security, privacy, migration, and rollback effects.
- Add or update tests for behavior changes.
- Keep generated files and unrelated formatting out of the diff.
- Do not include credentials, customer data, raw IP addresses, or private URLs.

By contributing, you agree that your contribution is licensed under the repository
license, AGPL-3.0-or-later. Maintainers may ask for a Developer Certificate of
Origin sign-off or contributor agreement in a future release; any such policy
change will be announced before it applies.
