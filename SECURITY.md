# Security policy

## Supported versions

Until the first stable release, only the latest tagged Community release receives
security fixes. The `main` branch may contain unreleased changes.

## Report a vulnerability privately

Do not open a public issue, discussion, or pull request for a suspected
vulnerability. Use the repository host's private security-advisory feature and
include:

- affected version or commit;
- deployment mode and relevant configuration with secrets removed;
- reproduction steps or a minimal proof of concept;
- likely impact and any known mitigation;
- a safe way to contact you.

If private security advisories have not yet been enabled, contact the repository
owner privately and ask for a secure reporting channel without sending exploit
details in the first message. A permanent monitored security address must be added
before public launch.

Maintainers should acknowledge a complete report within five business days, keep
the reporter informed, coordinate a fix and disclosure date, and credit the
reporter if requested. These targets are best-effort while the project is
pre-stable.

## Deployment responsibility

Internet-facing operators must use HTTPS, restrict `/cms`, keep secrets out of
images and logs, run committed migrations, configure off-host backups, and place
rate limits at a proxy/CDN. Association files and fallback allowlists should be
tested after every release.
