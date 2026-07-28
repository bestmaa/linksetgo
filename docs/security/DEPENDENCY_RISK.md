# Dependency advisory baseline

Last reviewed: 2026-07-27.

`npm audit --omit=dev` currently reports five moderate findings and no low, high, or
critical findings. All five records represent one transitive toolchain path:

`@payloadcms/db-postgres -> drizzle-kit -> @esbuild-kit/esm-loader ->
@esbuild-kit/core-utils -> esbuild@0.18.20`

The underlying advisory is
[GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99), which
affects an esbuild development server. Relay never starts that server. Drizzle Kit
is used by Payload's controlled database toolchain, and the production Next.js
standalone runner does not contain Drizzle Kit, `@esbuild-kit`, or esbuild. The
production-only migrator image contains the Payload toolchain, but executes only
explicit maintenance commands and exposes no network listener. The pinned Payload
adapter currently offers no non-breaking remediation for this old loader branch.

The complete dependency tree currently reports nine high findings and no critical
findings. They all roll up from
[GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg) in
`brace-expansion@1.1.16`, reached only through `minimatch@3.1.5` in ESLint and the
lint plugins bundled by `eslint-config-next`. These packages are development-only:
they are not copied into the production-only migrator and are absent from the
standalone runtime image. npm's proposed remediation requires ESLint 10, while the
current import, React, and accessibility plugins declare support only through
ESLint 9. Forcing that major upgrade or replacing Next's lint preset is not an
acceptable release-only change; track the upstream plugin compatibility updates.

Two reachable patch updates were applied during this review:

- Vitest was updated from 4.0.18 to 4.1.10, removing
  [GHSA-5xrq-8626-4rwp](https://github.com/advisories/GHSA-5xrq-8626-4rwp). Relay
  runs Vitest headlessly and never exposes its UI server, but the patched release
  removes the critical development-tool advisory completely.
- DOMPurify is pinned to 3.4.12 through an npm override, removing the Payload/Monaco
  sanitizer advisories from the production tree.

This is a reachability assessment, not a dismissal. CI rejects critical findings in
the complete tree and high or critical production findings. Dependabot opens
bounded npm and GitHub Actions updates. Maintainers must review upstream Payload
and ESLint ecosystem releases, retest the CMS/admin surface, and refresh this record
before each public tag.

Do not run `npm audit fix --force` automatically. It can cross framework and
database-tooling compatibility boundaries and does not replace a clean migration,
integration, build, and browser test.
