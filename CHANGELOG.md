# Changelog

All notable LinksetGo changes are recorded here. The project follows
[Semantic Versioning](https://semver.org/) after the first tagged release.

## [Unreleased]

## [0.1.0-rc.1] - 2026-07-28

First open-source Community release candidate. It includes the complete
self-hosted product and provider-neutral LinksetGo Cloud foundation. Production
operators must still supply their own domains, secrets, PostgreSQL database,
email delivery, ingress automation, monitoring, backups, and legal identity.

### Added

- Public product, pricing, documentation, open-source, security, status,
  sponsorship, privacy-draft, and terms-draft pages.
- Guided React Native custom-scheme import and post-create link handoff.
- Organizations, workspaces, memberships, and server-enforced tenant isolation.
- Managed/custom domain lifecycle and host-scoped public association foundation.
- Versioned Community, Free, Starter ($5), and Pro ($10) plan catalog.
- Provider-neutral billing, subscription reconciliation, and rate-limit
  foundations.
- Expanded Test Lab with saved-link selection, both-platform checks, and QR
  downloads.

### Changed

- Apps now begin as drafts.
- New analytics events use secret-keyed session HMACs and do not store raw
  user-agent strings.
- Public fallback pages no longer expose internal destination paths.

### Verification

- 57 integration files and 244 integration tests.
- 42 desktop/mobile browser flows.
- Clean migration rehearsal, production build, and non-root container smoke.
- Repository format, architecture, lint, and strict TypeScript checks.
